# Проверка Windows Job Objects

Выполнена 26 ноября 2026, Windows amd64, Go 1.27.4. Одноразовый технический прототип; код не является реализацией Panel.

Воспроизведение из корня ветки:

```powershell
go build -o bin/windows-job-probe.exe ./cases/process-panel/windows-job-probe/main.go
./bin/windows-job-probe.exe
```

Каждый опыт запускает управляющую программу, её дочерний процесс и HTTP-сервер во втором поколении. Независимый HTTP-сервер работает вне их Job Object. Идентичность проверяемых процессов удерживается открытыми дескрипторами; ожидание завершения ограничено пятью секундами.

Фактический вывод:

```json
{
  "os": "Windows_NT",
  "results": [
    "normal: tree and leaf exited, HTTP stopped, unrelated control HTTP alive",
    "crash: tree and leaf exited, HTTP stopped, unrelated control HTTP alive"
  ],
  "time": "2026-11-26T18:53:35+03:00"
}
```

Результат подтверждает применимость Job Objects для проверенного дерева: TerminateJobObject завершает группу, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE завершает её при аварийной потере владельца. PROC_THREAD_ATTRIBUTE_JOB_LIST назначает группу при создании процесса; дескриптор группы не наследуется. Это позволяет избежать промежутка между созданием и отдельным назначением группы.

Источники: [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects), [UpdateProcThreadAttribute](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute). Требуется Windows 10 или новее. Проверка относится к обычным потомкам CreateProcess; запуск через внешние службы и планировщики не проверен.
