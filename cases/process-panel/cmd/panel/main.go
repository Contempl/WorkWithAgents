package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"process-panel/internal/panel"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	assets := filepath.Join(filepath.Dir(executable), "..", "dist")
	if _, err = os.Stat(filepath.Join(assets, "index.html")); err != nil {
		return fmt.Errorf("интерфейс не собран. Запустите npm start из папки cases/process-panel")
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:4000")
	if err != nil {
		return fmt.Errorf("Не удалось запустить панель на 127.0.0.1:4000: %w", err)
	}
	defer listener.Close()
	dataDir := os.Getenv("PROCESS_PANEL_DATA_DIR")
	if dataDir == "" {
		dataDir = filepath.Join(filepath.Dir(executable), "..", "data")
	}
	registry, err := panel.Open(filepath.Join(dataDir, "projects.json"))
	if err != nil {
		return fmt.Errorf("Не удалось загрузить регистрации проектов: %w", err)
	}
	server := &http.Server{Handler: registry.Handler(assets), ReadHeaderTimeout: 5 * time.Second}
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(interrupt)
	// A terminal or launcher can pass down an inherited "ignore Ctrl+C" flag.
	// Enable console interrupts after Go has installed its signal handler.
	if ok, _, err := syscall.NewLazyDLL("kernel32.dll").NewProc("SetConsoleCtrlHandler").Call(0, 0); ok == 0 {
		return fmt.Errorf("Не удалось включить обработку Ctrl+C: %w", err)
	}
	finished := make(chan error, 1)
	go func() { finished <- server.Serve(listener) }()
	fmt.Println("Панель проектов: http://127.0.0.1:4000")
	var serveErr error
	select {
	case <-interrupt:
	case err = <-finished:
		if err != http.ErrServerClosed {
			serveErr = err
		}
	}
	stopErr := registry.Shutdown()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	httpErr := server.Shutdown(ctx)
	if err := errors.Join(serveErr, stopErr, httpErr); err != nil {
		return err
	}
	fmt.Println("Панель остановлена.")
	return nil
}
