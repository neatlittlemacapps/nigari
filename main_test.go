package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"nigari/server"
)

// Run main in a child process so its exit status and startup side effects are
// observable without binding the test runner to the application's lifecycle.
func TestCLIProcess(t *testing.T) {
	if os.Getenv("NIGARI_TEST_CLI") != "1" {
		return
	}
	os.Args = []string{"nigari", os.Args[len(os.Args)-1]}
	main()
	os.Exit(0)
}

func runCLI(t *testing.T, arg string) (string, string, error) {
	t.Helper()
	data := t.TempDir()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestCLIProcess$", "--", arg)
	cmd.Env = []string{
		"NIGARI_TEST_CLI=1", "NIGARI_DATA=" + data,
		"NIGARI_ADDR=127.0.0.1:0", "NIGARI_UPDATE_CHECK=0",
		"HOME=" + data, "TMPDIR=" + data,
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	if ctx.Err() != nil {
		t.Fatalf("%q did not exit; it may have started the server: %s", arg, stderr.String())
	}
	entries, readErr := os.ReadDir(data)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if len(entries) != 0 {
		t.Fatalf("%q modified the data directory: %v", arg, entries)
	}
	return stdout.String(), stderr.String(), err
}

func TestUnknownCommandDoesNotStartServer(t *testing.T) {
	for _, arg := range []string{"versoin", "--version", "--help"} {
		t.Run(arg, func(t *testing.T) {
			stdout, stderr, err := runCLI(t, arg)
			var exit *exec.ExitError
			if !errors.As(err, &exit) || exit.ExitCode() != 2 {
				t.Fatalf("want exit status 2, got %v; stderr: %s", err, stderr)
			}
			if stdout != "" {
				t.Fatalf("unexpected stdout: %q", stdout)
			}
			if !strings.Contains(stderr, "unknown command") || !strings.Contains(stderr, arg) || !strings.Contains(stderr, "usage: nigari") {
				t.Fatalf("missing command error or usage: %q", stderr)
			}
		})
	}
}

func TestVersionCommandStillWorks(t *testing.T) {
	stdout, stderr, err := runCLI(t, "version")
	// The line is "<release> (upgrade step N)" since spec 008: the release
	// first, so install.sh can take the first word, then the newest step.
	want := fmt.Sprintf("%s (upgrade step %d)", server.Version, server.NewestStep())
	if err != nil || stderr != "" || strings.TrimSpace(stdout) != want {
		t.Fatalf("version: stdout=%q stderr=%q error=%v", stdout, stderr, err)
	}
}

// An old SALT_ variable left in a service file must stop nigari before it
// reads anything (spec 011, FR-006): ignored, SALT_DATA would start on an
// empty ./data and the workspace would look lost. "version" would otherwise
// succeed, so a missing check shows as exit 0.
func TestOldVariableRefusesBeforeAnything(t *testing.T) {
	old := t.TempDir()
	cwd := t.TempDir()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestCLIProcess$", "--", "version")
	cmd.Dir = cwd
	cmd.Env = []string{"NIGARI_TEST_CLI=1", "SALT_DATA=" + old, "HOME=" + cwd, "TMPDIR=" + cwd}
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	var exit *exec.ExitError
	if !errors.As(err, &exit) || exit.ExitCode() != 2 {
		t.Fatalf("want exit status 2, got %v; stdout %q, stderr %q", err, stdout.String(), stderr.String())
	}
	if !strings.Contains(stderr.String(), "SALT_DATA → NIGARI_DATA") {
		t.Fatalf("the refusal does not name the rename: %q", stderr.String())
	}
	for _, dir := range []string{old, cwd} {
		if entries, _ := os.ReadDir(dir); len(entries) != 0 {
			t.Fatalf("the refused start wrote to %s: %v", dir, entries)
		}
	}
}
