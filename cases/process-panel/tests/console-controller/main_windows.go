// This test-only controller owns exactly one Panel and its console.
package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
	"unsafe"
)

func main() {
	if len(os.Args) < 2 {
		os.Exit(2)
	}
	// Direct Panel crash checks must observe its own job cleanup. Only launcher
	// tests need a backup job for grandchildren left by an unexpectedly exited npm.
	if len(os.Args) > 2 {
		if err := ownControllerTree(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
	child := exec.Command(os.Args[1], os.Args[2:]...)
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

// Include the controller itself in a non-inherited kill-on-close job. Its exit
// releases the last handle and also cleans up launcher grandchildren, even when
// an npm wrapper exits before its Go child. No process is discovered by port.
func ownControllerTree() error {
	type basic struct {
		UserTime, KernelTime int64
		Flags                uint32
		Min, Max             uintptr
		Active               uint32
		Affinity             uintptr
		Priority, Scheduling uint32
	}
	type extended struct {
		Basic  basic
		IO     [6]uint64
		Memory [4]uintptr
	}
	kernel := syscall.NewLazyDLL("kernel32.dll")
	job, _, err := kernel.NewProc("CreateJobObjectW").Call(0, 0)
	if job == 0 {
		return err
	}
	limits := extended{}
	limits.Basic.Flags = 0x2000
	ok, _, err := kernel.NewProc("SetInformationJobObject").Call(job, 9, uintptr(unsafe.Pointer(&limits)), unsafe.Sizeof(limits))
	if ok == 0 {
		syscall.CloseHandle(syscall.Handle(job))
		return err
	}
	ok, _, err = kernel.NewProc("AssignProcessToJobObject").Call(job, ^uintptr(0))
	if ok == 0 {
		syscall.CloseHandle(syscall.Handle(job))
		return err
	}
	// Do not close the handle while this member process is running. The OS closes
	// it during process exit, after its own exit status has been established.
	return nil
}
