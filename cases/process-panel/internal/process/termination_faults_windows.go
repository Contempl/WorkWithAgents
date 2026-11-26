//go:build windows && panelfaults

package process

import (
	"os"
	"strings"
	"syscall"
)

// Only the separately named test executable includes this hook. The single-use
// marker is created by the browser test in its own isolated scratch directory.
func terminationOverride() (bool, error) {
	path := os.Getenv("PROCESS_PANEL_TEST_STOP_FAULT")
	if path == "" {
		return false, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return false, nil
	}
	if err = os.Remove(path); err != nil {
		return true, err
	}
	if strings.TrimSpace(string(data)) == "unconfirmed" {
		return true, nil
	}
	return true, syscall.ERROR_ACCESS_DENIED
}
