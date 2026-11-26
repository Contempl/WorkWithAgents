package main

import (
	"context"
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
	executable, err := os.Executable()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	assets := filepath.Join(filepath.Dir(executable), "..", "dist")
	if _, err = os.Stat(filepath.Join(assets, "index.html")); err != nil {
		fmt.Fprintln(os.Stderr, "Интерфейс не собран. Запустите npm start из папки cases/process-panel.")
		os.Exit(1)
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:4000")
	if err != nil {
		fmt.Fprintln(os.Stderr, "Не удалось запустить панель на 127.0.0.1:4000:", err)
		os.Exit(1)
	}
	dataDir := os.Getenv("PROCESS_PANEL_DATA_DIR")
	if dataDir == "" {
		dataDir = filepath.Join(filepath.Dir(executable), "..", "data")
	}
	registry, err := panel.Open(filepath.Join(dataDir, "projects.json"))
	if err != nil {
		fmt.Fprintln(os.Stderr, "Не удалось загрузить регистрации проектов:", err)
		listener.Close()
		os.Exit(1)
	}
	server := &http.Server{Handler: registry.Handler(assets), ReadHeaderTimeout: 5 * time.Second}
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)
	// A terminal or launcher can pass down an inherited "ignore Ctrl+C" flag.
	// Enable console interrupts after Go has installed its signal handler.
	if ok, _, err := syscall.NewLazyDLL("kernel32.dll").NewProc("SetConsoleCtrlHandler").Call(0, 0); ok == 0 {
		fmt.Fprintln(os.Stderr, "Не удалось включить обработку Ctrl+C:", err)
		listener.Close()
		os.Exit(1)
	}
	finished := make(chan error, 1)
	go func() { finished <- server.Serve(listener) }()
	fmt.Println("Панель проектов: http://127.0.0.1:4000")
	select {
	case <-interrupt:
	case err = <-finished:
		if err != http.ErrServerClosed {
			fmt.Fprintln(os.Stderr, err)
		}
	}
	registry.Shutdown()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	server.Shutdown(ctx)
}
