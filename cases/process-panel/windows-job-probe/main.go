// Disposable Windows-only experiment. Not application code.
package main

import (
 "bufio"
 "encoding/json"
 "fmt"
 "net"
 "net/http"
 "os"
 "os/exec"
 "path/filepath"
 "syscall"
 "time"
 "unsafe"
)

var kernel = syscall.NewLazyDLL("kernel32.dll")
var createJob = kernel.NewProc("CreateJobObjectW")
var setJob = kernel.NewProc("SetInformationJobObject")
var terminateJob = kernel.NewProc("TerminateJobObject")
var initAttrs = kernel.NewProc("InitializeProcThreadAttributeList")
var updateAttr = kernel.NewProc("UpdateProcThreadAttribute")
var deleteAttrs = kernel.NewProc("DeleteProcThreadAttributeList")

type limits struct {
 UserTime, KernelTime int64
 Flags uint32
 Min, Max uintptr
 Active uint32
 Affinity uintptr
 Priority, Scheduling uint32
}
type extendedLimits struct {
 Basic limits
 IO [6]uint64
 ProcessMemory, JobMemory, PeakProcess, PeakJob uintptr
}
type startupEx struct { syscall.StartupInfo; Attributes uintptr }

func check(ok uintptr, err error) { if ok == 0 { panic(err) } }
func launch(command string) (syscall.Handle, syscall.Handle) {
 job, _, e := createJob.Call(0, 0); check(job,e)
 info := extendedLimits{}; info.Basic.Flags = 0x2000
 ok,_,e := setJob.Call(job,9,uintptr(unsafe.Pointer(&info)),unsafe.Sizeof(info)); check(ok,e)
 var size uintptr
 initAttrs.Call(0,1,0,uintptr(unsafe.Pointer(&size)))
 data := make([]byte,size)
 attrs := uintptr(unsafe.Pointer(&data[0]))
 ok,_,e = initAttrs.Call(attrs,1,0,uintptr(unsafe.Pointer(&size))); check(ok,e)
 defer deleteAttrs.Call(attrs)
 ok,_,e = updateAttr.Call(attrs,0,0x2000d,uintptr(unsafe.Pointer(&job)),unsafe.Sizeof(job),0,0); check(ok,e)
 si := startupEx{Attributes:attrs}; si.Cb=uint32(unsafe.Sizeof(si))
 var pi syscall.ProcessInformation
 line,_ := syscall.UTF16PtrFromString(command)
 if e:=syscall.CreateProcess(nil,line,nil,nil,false,0x80000|0x08000000,nil,nil,&si.StartupInfo,&pi); e!=nil { panic(e) }
 syscall.CloseHandle(pi.Thread)
 return syscall.Handle(job),pi.Process
}

type record struct { PID int; Address string }
func save(path string, value record) { data,_:=json.Marshal(value); if err:=os.WriteFile(path,data,0600);err!=nil {panic(err)} }
func read(path string) record {
 deadline:=time.Now().Add(10*time.Second)
 for time.Now().Before(deadline) { data,e:=os.ReadFile(path); var r record; if e==nil && json.Unmarshal(data,&r)==nil {return r}; time.Sleep(30*time.Millisecond) }
 panic("timeout: "+path)
}
func responds(addr string) bool { c:=http.Client{Timeout:200*time.Millisecond}; r,e:=c.Get("http://"+addr); if e!=nil{return false}; r.Body.Close(); return r.StatusCode==200 }
func waitDead(handle syscall.Handle) { r,e:=syscall.WaitForSingleObject(handle,5000); if e!=nil||r!=0 {panic(fmt.Sprintf("process remains: %v %d",e,r))} }
func main() {
 exe,_:=os.Executable()
 if len(os.Args)>1 {
  mode,path:=os.Args[1],os.Args[2]
  switch mode {
  case "leaf":
   l,e:=net.Listen("tcp4","127.0.0.1:0");if e!=nil{panic(e)}
   save(path,record{os.Getpid(),l.Addr().String()})
   http.Serve(l,http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){fmt.Fprint(w,"probe")}))
  case "tree":
   save(path+".tree",record{PID:os.Getpid()})
   c:=exec.Command(exe,"leaf",path+".leaf"); if e:=c.Start();e!=nil{panic(e)}; c.Wait()
  case "controller":
   job,process:=launch(syscall.EscapeArg(exe)+" tree "+syscall.EscapeArg(path))
   defer syscall.CloseHandle(process); defer syscall.CloseHandle(job)
   bufio.NewReader(os.Stdin).ReadString('\n')
   ok,_,e:=terminateJob.Call(uintptr(job),1);check(ok,e)
   waitDead(process)
  }
  return
 }
 dir,e:=os.MkdirTemp("","panel-job-probe-");if e!=nil{panic(e)};defer os.RemoveAll(dir)
 control:=exec.Command(exe,"leaf",filepath.Join(dir,"control")); if e:=control.Start();e!=nil{panic(e)}
 defer func(){control.Process.Kill();control.Wait()}()
 independent:=read(filepath.Join(dir,"control"))
 results:=[]string{}
 for _,mode:=range []string{"normal","crash"} {
  path:=filepath.Join(dir,mode)
  c:=exec.Command(exe,"controller",path); c.Stderr=os.Stderr
  input,_:=c.StdinPipe();if e:=c.Start();e!=nil{panic(e)}
  tree,leaf:=read(path+".tree"),read(path+".leaf")
  if !responds(leaf.Address){panic("leaf not responding")}
  handles:=[]syscall.Handle{}
  for _,pid:=range []int{tree.PID,leaf.PID} {h,e:=syscall.OpenProcess(0x100000,false,uint32(pid));if e!=nil{panic(e)};handles=append(handles,h)}
  if mode=="normal" {fmt.Fprintln(input,"stop")} else {c.Process.Kill()}
  c.Wait();input.Close()
  for _,h:=range handles {waitDead(h);syscall.CloseHandle(h)}
  if responds(leaf.Address){panic("leaf still responds")}
  if !responds(independent.Address){panic("control was stopped")}
  results=append(results,mode+": tree and leaf exited, HTTP stopped, unrelated control HTTP alive")
 }
 data,_:=json.MarshalIndent(map[string]any{"time":time.Now().Format(time.RFC3339),"os":os.Getenv("OS"),"results":results},"","  ")
 fmt.Println(string(data))
}
