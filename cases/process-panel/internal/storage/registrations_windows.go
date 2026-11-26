//go:build windows

// Package storage persists registrations, never process state or output.
package storage

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

type Registration struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Folder  string `json:"folder"`
	Command string `json:"command"`
}
type document struct {
	Version  int            `json:"version"`
	Projects []Registration `json:"projects"`
}
type File struct{ Path string }

func (s File) Load() ([]Registration, error) {
	file, err := os.Open(s.Path)
	if errors.Is(err, os.ErrNotExist) {
		return []Registration{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	var doc document
	if err = decoder.Decode(&doc); err != nil {
		return nil, fmt.Errorf("не удалось прочитать регистрации: %w", err)
	}
	var extra any
	if err = decoder.Decode(&extra); err != io.EOF {
		return nil, fmt.Errorf("лишние данные после списка регистраций")
	}
	if doc.Version != 1 || doc.Projects == nil {
		return nil, fmt.Errorf("неподдерживаемый формат списка регистраций")
	}
	seen := make(map[string]bool)
	for _, p := range doc.Projects {
		id, err := hex.DecodeString(p.ID)
		if err != nil || len(id) != 16 || seen[p.ID] || strings.TrimSpace(p.Name) == "" || !filepath.IsAbs(p.Folder) || strings.TrimSpace(p.Command) == "" || strings.ContainsRune(p.Command, 0) {
			return nil, fmt.Errorf("некорректная регистрация проекта %q", p.ID)
		}
		seen[p.ID] = true
	}
	// Missing Project folders are retained so the user can correct or remove them.
	return doc.Projects, nil
}

func (s File) Save(projects []Registration) error {
	if err := os.MkdirAll(filepath.Dir(s.Path), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(s.Path), ".projects-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err = encoder.Encode(document{Version: 1, Projects: projects}); err != nil {
		return err
	}
	if err = file.Sync(); err != nil {
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	from, err := syscall.UTF16PtrFromString(file.Name())
	if err != nil {
		return err
	}
	to, err := syscall.UTF16PtrFromString(s.Path)
	if err != nil {
		return err
	}
	// Replace only after the complete file has been flushed and closed. Same directory,
	// no copy-across-volume fallback, and no delete of the old file before replacement.
	ok, _, err := syscall.NewLazyDLL("kernel32.dll").NewProc("MoveFileExW").Call(uintptr(unsafe.Pointer(from)), uintptr(unsafe.Pointer(to)), 0x1|0x8)
	if ok == 0 {
		return fmt.Errorf("замена файла регистраций: %w", err)
	}
	return nil
}
