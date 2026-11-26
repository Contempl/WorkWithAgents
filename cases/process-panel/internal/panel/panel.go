package panel

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"process-panel/internal/process"
	"process-panel/internal/storage"
)

type Project struct {
	storage.Registration
	State        string `json:"state"`
	Output       string `json:"output"`
	Error        string `json:"error"`
	Active       bool   `json:"active"`
	run          *process.Run
	readerDone   chan struct{}
	stopDeadline time.Time
}
type Registry struct {
	mu       sync.Mutex
	projects []*Project
	store    storage.File
	closed   bool
}

func Open(path string) (*Registry, error) {
	s := &Registry{projects: make([]*Project, 0), store: storage.File{Path: path}}
	registrations, err := s.store.Load()
	if err != nil {
		return nil, err
	}
	for _, registration := range registrations {
		s.projects = append(s.projects, &Project{Registration: registration, State: "stopped"})
	}
	return s, nil
}

func readRegistration(w http.ResponseWriter, r *http.Request) (storage.Registration, bool) {
	var input struct {
		Name    string `json:"name"`
		Folder  string `json:"folder"`
		Command string `json:"command"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		fail(w, 400, "Некорректные данные проекта")
		return storage.Registration{}, false
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		fail(w, 400, "Некорректные данные проекта")
		return storage.Registration{}, false
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Folder = strings.TrimSpace(input.Folder)
	if input.Name == "" || len(input.Name) > 800 || !process.ValidCommand(input.Command) || !filepath.IsAbs(input.Folder) {
		fail(w, 400, "Укажите название, абсолютный путь к папке и команду запуска")
		return storage.Registration{}, false
	}
	info, err := os.Stat(input.Folder)
	if err != nil || !info.IsDir() {
		fail(w, 400, "Папка проекта не найдена")
		return storage.Registration{}, false
	}
	return storage.Registration{Name: input.Name, Folder: input.Folder, Command: input.Command}, true
}

// saveChanges builds a registration-only snapshot. Memory changes follow a successful save.
func (s *Registry) saveChanges(id string, replacement *storage.Registration) error {
	registrations := make([]storage.Registration, 0, len(s.projects)+1)
	for _, p := range s.projects {
		if p.ID == id {
			if replacement != nil {
				registrations = append(registrations, *replacement)
			}
		} else {
			registrations = append(registrations, p.Registration)
		}
	}
	if id == "" && replacement != nil {
		registrations = append(registrations, *replacement)
	}
	return s.store.Save(registrations)
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}
func fail(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
func (s *Registry) Handler(assets string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/projects", s.collection)
	mux.HandleFunc("/api/projects/", s.action)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { fail(w, 404, "Неизвестный запрос") })
	mux.Handle("/", http.FileServer(http.Dir(assets)))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Same-origin writes only; never allow another website to execute a local command.
		if r.Method != "GET" && r.Method != "HEAD" {
			origin := r.Header.Get("Origin")
			if (origin != "" && origin != "http://"+r.Host) || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
				fail(w, 403, "Запрос должен исходить из панели")
				return
			}
			if r.Method != "DELETE" && !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
				fail(w, 415, "Требуется JSON")
				return
			}
		}
		if r.Host != "127.0.0.1:4000" {
			fail(w, 403, "Откройте панель по адресу http://127.0.0.1:4000")
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		mux.ServeHTTP(w, r)
	})
}
func (s *Registry) collection(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		fail(w, 503, "Панель выключается")
		return
	}
	switch r.Method {
	case "GET":
		writeJSON(w, 200, s.projects)
	case "POST":
		registration, ok := readRegistration(w, r)
		if !ok {
			return
		}
		var identity [16]byte
		if _, err := rand.Read(identity[:]); err != nil {
			fail(w, 500, "Не удалось создать идентификатор проекта")
			return
		}
		registration.ID = hex.EncodeToString(identity[:])
		if err := s.saveChanges("", &registration); err != nil {
			fail(w, 500, "Не удалось сохранить проект: "+err.Error())
			return
		}
		p := &Project{Registration: registration, State: "stopped"}
		s.projects = append(s.projects, p)
		writeJSON(w, 201, p)
	default:
		w.Header().Set("Allow", "GET, POST")
		fail(w, 405, "Метод не поддерживается")
	}
}
func (s *Registry) action(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/projects/"), "/")
	registrationAction := len(parts) == 1 && parts[0] != ""
	if !registrationAction && (len(parts) != 2 || (parts[1] != "start" && parts[1] != "stop")) {
		fail(w, 404, "Неизвестное действие")
		return
	}
	if (registrationAction && r.Method != "PUT" && r.Method != "DELETE") || (!registrationAction && r.Method != "POST") {
		if registrationAction {
			w.Header().Set("Allow", "PUT, DELETE")
		} else {
			w.Header().Set("Allow", "POST")
		}
		fail(w, 405, "Метод не поддерживается")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		fail(w, 503, "Панель выключается")
		return
	}
	var p *Project
	for _, candidate := range s.projects {
		if candidate.ID == parts[0] {
			p = candidate
			break
		}
	}
	if p == nil {
		fail(w, 404, "Проект не найден")
		return
	}
	if registrationAction {
		if p.Active || p.run != nil || p.State == "starting" || p.State == "stopping" {
			fail(w, 409, "Сначала остановите проект")
			return
		}
		if r.Method == "PUT" {
			registration, ok := readRegistration(w, r)
			if !ok {
				return
			}
			registration.ID = p.ID
			if err := s.saveChanges(p.ID, &registration); err != nil {
				fail(w, 500, "Не удалось сохранить изменения: "+err.Error())
				return
			}
			p.Registration = registration
			writeJSON(w, 200, p)
		} else {
			if err := s.saveChanges(p.ID, nil); err != nil {
				fail(w, 500, "Не удалось удалить регистрацию: "+err.Error())
				return
			}
			for index, candidate := range s.projects {
				if candidate == p {
					s.projects = slices.Delete(s.projects, index, index+1)
					break
				}
			}
			writeJSON(w, 200, map[string]bool{"deleted": true})
		}
		return
	}
	if parts[1] == "start" {
		if p.Active || p.State == "starting" || p.State == "stopping" {
			fail(w, 409, "Проект уже запущен или меняет состояние")
			return
		}
		p.State = "starting"
		p.Output = ""
		p.Error = ""
		// The transition is returned before launching; all repeated starts see 'starting'.
		go s.launch(p)
	} else {
		if !p.Active || p.run == nil {
			fail(w, 409, "У проекта нет активного запуска")
			return
		}
		if p.State == "stopping" {
			fail(w, 409, "Остановка уже выполняется")
			return
		}
		p.State = "stopping"
		p.Error = ""
		p.stopDeadline = time.Now().Add(5 * time.Second)
		if err := p.run.Terminate(); err != nil {
			p.State = "error"
			p.Error = "Не удалось остановить проект: " + err.Error()
		}
	}
	writeJSON(w, 202, p)
}
func (s *Registry) launch(p *Project) {
	s.mu.Lock()
	if s.closed {
		p.State = "stopped"
		s.mu.Unlock()
		return
	}
	run, err := process.Launch(p.Folder, p.Command)
	if err != nil {
		p.State = "error"
		p.Error = "Не удалось запустить проект: " + err.Error()
		s.mu.Unlock()
		return
	}
	p.run = run
	p.Active = true
	p.State = "running"
	p.readerDone = make(chan struct{})
	readerDone := p.readerDone
	s.mu.Unlock()
	go func() {
		defer close(readerDone)
		defer run.Output.Close()
		buffer := make([]byte, 8192)
		for {
			n, err := run.Output.Read(buffer)
			if n > 0 {
				s.mu.Lock()
				p.Output += string(buffer[:n])
				s.mu.Unlock()
			}
			if err != nil {
				if err != io.EOF {
					s.mu.Lock()
					p.Error = "Ошибка чтения вывода: " + err.Error()
					s.mu.Unlock()
				}
				return
			}
		}
	}()
	ticker := time.NewTicker(30 * time.Millisecond)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.Lock()
		active, queryErr := run.Active()
		if queryErr != nil {
			p.State = "error"
			p.Error = "Не удалось проверить процессы: " + queryErr.Error()
			s.mu.Unlock()
			continue
		}
		if !active {
			code, exitErr := run.ExitCode()
			stopping := p.State == "stopping"
			s.mu.Unlock()
			// Drain output before allowing the next run to replace it.
			<-readerDone
			s.mu.Lock()
			p.Active = false
			p.run = nil
			if stopping || code == 0 {
				p.State = "stopped"
			} else {
				p.State = "error"
				p.Error = fmt.Sprintf("Программа завершилась с кодом %d", code)
			}
			if exitErr != nil {
				p.State = "error"
				p.Error = exitErr.Error()
			}
			run.Close()
			s.mu.Unlock()
			return
		}
		if p.State == "stopping" && time.Now().After(p.stopDeadline) {
			p.State = "error"
			p.Error = "За 5 секунд завершение процессов не подтверждено. Повторите остановку."
		}
		s.mu.Unlock()
	}
}

// Shutdown refuses new launches and terminates only owned jobs.
func (s *Registry) Shutdown() {
	s.mu.Lock()
	s.closed = true
	for _, p := range s.projects {
		if p.run != nil {
			p.State = "stopping"
			p.run.Terminate()
		}
	}
	s.mu.Unlock()
	deadline := time.Now().Add(6 * time.Second)
	for time.Now().Before(deadline) {
		s.mu.Lock()
		active := false
		for _, p := range s.projects {
			active = active || p.Active
		}
		s.mu.Unlock()
		if !active {
			return
		}
		time.Sleep(30 * time.Millisecond)
	}
}
