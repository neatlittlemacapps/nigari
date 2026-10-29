package server

import (
	"errors"
	"strings"
)

// The fork was salt.md until v2.0.0 and is nigari from then on (spec 011).
// The owner chose no transition: from v2.0.0 nothing answers to an old name.
// This file is where the old names still live, because something has to meet
// them once: data under an old name is moved, and an old name that would
// otherwise be ignored without a word is refused with a sentence instead.
// check-names.mjs allows the old names here and nowhere else in the server.

const oldEnvPrefix = "SALT_"

// CheckOldEnv looks for environment variables that still carry their
// salt.md names. It runs first in main, before any variable is read.
//
// The case it exists for: a service file with SALT_DATA=/srv/salt. Ignoring
// it would start on ./data, an empty workspace, and the admin would think the
// data was gone. So a SALT_X without NIGARI_X refuses the start, naming every
// such variable and its new name. A SALT_X beside its NIGARI_X is harmless:
// the new one is used and the old one gets a line in the log.
//
// Every SALT_ prefix counts, not only the variables the server reads: one the
// installer read, or a typo, is as wrong under the old name.
func CheckOldEnv(environ []string) (ignored []string, refusal error) {
	set := map[string]bool{}
	for _, kv := range environ {
		if name, _, ok := strings.Cut(kv, "="); ok {
			set[name] = true
		}
	}
	var renames []string
	for _, kv := range environ {
		name, _, ok := strings.Cut(kv, "=")
		if !ok || !strings.HasPrefix(name, oldEnvPrefix) {
			continue
		}
		newName := "NIGARI_" + strings.TrimPrefix(name, oldEnvPrefix)
		if set[newName] {
			ignored = append(ignored, name+" is ignored: "+newName+" is set. Remove "+name+" where it is set.")
			continue
		}
		renames = append(renames, name+" → "+newName)
	}
	if len(renames) > 0 {
		return ignored, errors.New("nigari did not start: these variables still have their salt.md names: " +
			strings.Join(renames, ", ") +
			". Rename them where they are set (service file, compose file, shell) and start again. Nothing was changed.")
	}
	return ignored, nil
}
