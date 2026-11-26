//go:build windows

// Package process owns Windows process groups created by the Panel.
package process

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"unsafe"
)

var kernel = syscall.NewLazyDLL("kernel32.dll")
var createJob = kernel.NewProc("CreateJobObjectW")
var setJob = kernel.NewProc("SetInformationJobObject")
var queryJob = kernel.NewProc("QueryInformationJobObject")
var terminateJob = kernel.NewProc("TerminateJobObject")
var initAttributes = kernel.NewProc("InitializeProcThreadAttributeList")
var updateAttribute = kernel.NewProc("UpdateProcThreadAttribute")
var deleteAttributes = kernel.NewProc("DeleteProcThreadAttributeList")

type basicLimits struct {
	UserTime, KernelTime         int64
	Flags                        uint32
	MinWorkingSet, MaxWorkingSet uintptr
	ActiveProcessLimit           uint32
	Affinity                     uintptr
	Priority, Scheduling         uint32
}
type extendedLimits struct {
	Basic                                          basicLimits
	IO                                             [6]uint64
	ProcessMemory, JobMemory, PeakProcess, PeakJob uintptr
}
type accounting struct {
	Times                                                            [4]int64
	PageFaults, TotalProcesses, ActiveProcesses, TerminatedProcesses uint32
}
type startupEx struct {
	syscall.StartupInfo
	Attributes uintptr
}

// Run's methods are serialized by the registry. Only the output reader is concurrent.
type Run struct {
	job    syscall.Handle
	root   syscall.Handle
	Output *os.File
}

func apiError(operation string, err error) error { return fmt.Errorf("%s: %w", operation, err) }

func Launch(folder, command string) (_ *Run, err error) {
	job, _, e := createJob.Call(0, 0)
	if job == 0 {
		return nil, apiError("CreateJobObject", e)
	}
	success := false
	defer func() {
		if !success {
			syscall.CloseHandle(syscall.Handle(job))
		}
	}()
	limits := extendedLimits{}
	limits.Basic.Flags = 0x2000 // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, no breakaway.
	ok, _, e := setJob.Call(job, 9, uintptr(unsafe.Pointer(&limits)), unsafe.Sizeof(limits))
	if ok == 0 {
		return nil, apiError("SetInformationJobObject", e)
	}

	reader, writer, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	defer writer.Close()
	defer func() {
		if !success {
			reader.Close()
		}
	}()
	input, err := os.Open(os.DevNull)
	if err != nil {
		return nil, err
	}
	defer input.Close()
	inherited := []syscall.Handle{syscall.Handle(input.Fd()), syscall.Handle(writer.Fd())}
	for _, h := range inherited {
		if err = syscall.SetHandleInformation(h, syscall.HANDLE_FLAG_INHERIT, syscall.HANDLE_FLAG_INHERIT); err != nil {
			return nil, err
		}
	}
	// The explicit handle list prevents inheriting another Project's pipe or job handle.
	var size uintptr
	initAttributes.Call(0, 2, 0, uintptr(unsafe.Pointer(&size)))
	if size == 0 {
		return nil, fmt.Errorf("InitializeProcThreadAttributeList: размер не определён")
	}
	storage := make([]byte, size)
	attributes := uintptr(unsafe.Pointer(&storage[0]))
	ok, _, e = initAttributes.Call(attributes, 2, 0, uintptr(unsafe.Pointer(&size)))
	if ok == 0 {
		return nil, apiError("InitializeProcThreadAttributeList", e)
	}
	defer func() { deleteAttributes.Call(attributes); runtime.KeepAlive(storage); runtime.KeepAlive(inherited) }()
	ok, _, e = updateAttribute.Call(attributes, 0, 0x2000d, uintptr(unsafe.Pointer(&job)), unsafe.Sizeof(job), 0, 0)
	if ok == 0 {
		return nil, apiError("PROC_THREAD_ATTRIBUTE_JOB_LIST", e)
	}
	ok, _, e = updateAttribute.Call(attributes, 0, 0x20002, uintptr(unsafe.Pointer(&inherited[0])), uintptr(len(inherited))*unsafe.Sizeof(inherited[0]), 0, 0)
	if ok == 0 {
		return nil, apiError("PROC_THREAD_ATTRIBUTE_HANDLE_LIST", e)
	}
	si := startupEx{Attributes: attributes}
	si.Cb = uint32(unsafe.Sizeof(si))
	si.Flags = syscall.STARTF_USESTDHANDLES
	si.StdInput = inherited[0]
	si.StdOutput = inherited[1]
	si.StdErr = inherited[1]
	shell := filepath.Join(os.Getenv("SystemRoot"), "System32", "cmd.exe")
	application, err := syscall.UTF16PtrFromString(shell)
	if err != nil {
		return nil, err
	}
	// cmd /s /c preserves quoting for arbitrary user commands, including quoted executables.
	line, err := syscall.UTF16PtrFromString(syscall.EscapeArg(shell) + ` /d /s /c "chcp 65001 >nul & ` + command + `"`)
	if err != nil {
		return nil, err
	}
	directory, err := syscall.UTF16PtrFromString(folder)
	if err != nil {
		return nil, err
	}
	var pi syscall.ProcessInformation
	// Assign the job during CreateProcess, without an unowned suspended-process interval.
	err = syscall.CreateProcess(application, line, nil, nil, true, 0x80000|0x08000000, nil, directory, &si.StartupInfo, &pi)
	if err != nil {
		return nil, apiError("CreateProcess", err)
	}
	syscall.CloseHandle(pi.Thread)
	success = true
	return &Run{job: syscall.Handle(job), root: pi.Process, Output: reader}, nil
}

func (r *Run) Active() (bool, error) {
	var data accounting
	ok, _, e := queryJob.Call(uintptr(r.job), 1, uintptr(unsafe.Pointer(&data)), unsafe.Sizeof(data), 0)
	if ok == 0 {
		return true, apiError("QueryInformationJobObject", e)
	}
	return data.ActiveProcesses != 0, nil
}
func (r *Run) ExitCode() (uint32, error) {
	var code uint32
	err := syscall.GetExitCodeProcess(r.root, &code)
	return code, err
}
func (r *Run) Terminate() error {
	ok, _, e := terminateJob.Call(uintptr(r.job), 1)
	if ok == 0 {
		return apiError("TerminateJobObject", e)
	}
	return nil
}
func (r *Run) Close() { syscall.CloseHandle(r.root); syscall.CloseHandle(r.job) }

func ValidCommand(command string) bool {
	return strings.TrimSpace(command) != "" && !strings.ContainsRune(command, 0)
}
