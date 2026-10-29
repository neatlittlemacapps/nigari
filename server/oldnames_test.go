package server

import (
	"strings"
	"testing"
)

// Spec 011 FR-006: an old variable on its own refuses, naming its new name;
// beside its new name it is ignored with a line. Every SALT_ counts.

func TestOldEnvRefusesAlone(t *testing.T) {
	_, err := CheckOldEnv([]string{"HOME=/root", "SALT_DATA=/srv/salt"})
	if err == nil || !strings.Contains(err.Error(), "SALT_DATA → NIGARI_DATA") || !strings.Contains(err.Error(), "Nothing was changed.") {
		t.Fatalf("want a refusal naming SALT_DATA → NIGARI_DATA, got %v", err)
	}
}

func TestOldEnvListsEveryOldName(t *testing.T) {
	_, err := CheckOldEnv([]string{"SALT_DATA=/srv/salt", "PATH=/bin", "SALT_ADDR=:80"})
	if err == nil || !strings.Contains(err.Error(), "SALT_DATA → NIGARI_DATA, SALT_ADDR → NIGARI_ADDR") {
		t.Fatalf("want both names, in the environment's order, got %v", err)
	}
}

func TestOldEnvIgnoredBesideNew(t *testing.T) {
	ignored, err := CheckOldEnv([]string{"SALT_DATA=/x", "NIGARI_DATA=/srv/nigari"})
	if err != nil {
		t.Fatalf("an old name beside its new one must not refuse: %v", err)
	}
	if len(ignored) != 1 || !strings.HasPrefix(ignored[0], "SALT_DATA is ignored: NIGARI_DATA is set.") {
		t.Fatalf("want one ignored line, got %q", ignored)
	}
}

func TestOldEnvNoneSet(t *testing.T) {
	ignored, err := CheckOldEnv([]string{"NIGARI_DATA=/srv/nigari", "HOME=/root", "BASALT_X=1"})
	if err != nil || len(ignored) != 0 {
		t.Fatalf("no old names: want nothing, got %q, %v", ignored, err)
	}
}
