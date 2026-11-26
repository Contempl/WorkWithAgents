//go:build windows && !panelfaults

package process

// Production builds have no fault-injection switches or environment lookups.
func terminationOverride() (bool, error) { return false, nil }
