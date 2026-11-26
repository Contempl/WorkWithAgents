// This test-only controller owns exactly one Panel and its console.
package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
)

func main() {
	if len(os.Args) != 2 {
		os.Exit(2)
	}
	child := exec.Command(os.Args[1])
	child.Stdout = os.Stdout
	child.Stderr = os.Stderr
	child.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x10, HideWindow: true} // CREATE_NEW_CONSOLE
	if err := child.Start(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer child.Process.Kill()
	done := make(chan error, 1)
	go func() { done <- child.Wait() }()
	commands := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(os.Stdin)
		if scanner.Scan() {
			commands <- scanner.Text()
		} else {
			commands <- "crash"
		}
	}()
	var err error
	select {
	case err = <-done:
	case command := <-commands:
		if command == "stop" {
			kernel := syscall.NewLazyDLL("kernel32.dll")
			kernel.NewProc("FreeConsole").Call()
			ok, _, callErr := kernel.NewProc("AttachConsole").Call(uintptr(child.Process.Pid))
			if ok == 0 {
				fmt.Fprintln(os.Stderr, callErr)
				child.Process.Kill()
				<-done
				os.Exit(1)
			}
			// Ignore our own broadcast; the Panel's separate console contains no unrelated processes.
			kernel.NewProc("SetConsoleCtrlHandler").Call(0, 1)
			ok, _, callErr = kernel.NewProc("GenerateConsoleCtrlEvent").Call(0, 0)
			if ok == 0 {
				fmt.Fprintln(os.Stderr, callErr)
				child.Process.Kill()
				<-done
				os.Exit(1)
			}
		} else {
			child.Process.Kill()
		}
		select {
		case err = <-done:
		case <-time.After(10 * time.Second):
			child.Process.Kill()
			<-done
			fmt.Fprintln(os.Stderr, "Panel shutdown timed out")
			os.Exit(1)
		}
	}
	if err != nil {
		os.Exit(1)
	}
}
