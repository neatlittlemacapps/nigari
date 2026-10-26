#!/usr/bin/env bash
# Compares two runs of the storage benchmarks with benchstat and decides
# whether the head regressed.
#
#   scripts/bench-compare.sh old.txt new.txt
#
# Run by the `bench` job in .github/workflows/ci.yml (base vs head, both
# `go test ./server -run '^$' -bench Storage -count=6`). Works locally too.
#
# Writes the benchstat table to $GITHUB_STEP_SUMMARY when it is set, and to
# stdout. A significant (p < 0.05) p95 change above +15% is a `::warning::`;
# above +50% the script exits 1. Why two levels (research P4): shared runners
# are noisy, and a build that is red half the time for nothing gets ignored, so
# only a regression too large for noise fails.
#
# The inputs are filtered to benchmark lines first. `go test` also prints
# `go: downloading …` and the server's log lines; benchstat reads `go:` as a
# configuration key, so one file with download lines and one without no longer
# line up, and benchstat prints two tables with no comparison at all (found
# measuring the driver bump, #60).
set -euo pipefail

old="${1:?usage: bench-compare.sh old.txt new.txt}"
new="${2:?usage: bench-compare.sh old.txt new.txt}"
warn="${BENCH_WARN_PCT:-15}"
fail="${BENCH_FAIL_PCT:-50}"

# Pinned: a CI tool run through `go run`, not a module dependency.
benchstat=(go run golang.org/x/perf/cmd/benchstat@v0.0.0-20261009192801-be2c69fb417e)

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
for f in old new; do
  src="$old"; [[ $f == new ]] && src="$new"
  grep -E '^(goos|goarch|pkg|cpu|Benchmark)' "$src" > "$tmp/$f.txt" || true
  if ! grep -q '^Benchmark' "$tmp/$f.txt"; then
    echo "bench-compare: no benchmark lines in $src" >&2
    exit 2
  fi
done

# Readable names in the table header instead of temp file names.
cp "$tmp/old.txt" "$tmp/base"
cp "$tmp/new.txt" "$tmp/head"
table="$(cd "$tmp" && "${benchstat[@]}" base head)"
csv="$(cd "$tmp" && "${benchstat[@]}" -format csv base head)"

# The p95 section of the CSV: a header row containing "p95", then one row per
# benchmark until the geomean. Column 6 is the change, "~" when benchstat finds
# no significant difference, so only significant changes are compared.
verdicts="$(awk -F, -v warn="$warn" -v fail="$fail" '
  /^,/ { in95 = ($2 ~ /^p95/); next }
  in95 && $1 != "geomean" && $6 ~ /%$/ {
    pct = $6; sub(/%$/, "", pct); pct += 0
    if (pct > fail)      print "FAIL " $1 " " $6
    else if (pct > warn) print "WARN " $1 " " $6
  }' <<<"$csv")"

{
  echo "### Storage benchmarks: base vs head"
  echo
  echo "Warn above +${warn}% p95, fail above +${fail}% (significant changes only, p < 0.05)."
  echo
  echo '```'
  echo "$table"
  echo '```'
  if [[ -n "$verdicts" ]]; then
    echo
    echo "**p95 regressions:**"
    echo
    sed 's/^/- /' <<<"$verdicts"
  fi
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"

status=0
while read -r level name change; do
  [[ -z "${level:-}" ]] && continue
  if [[ $level == FAIL ]]; then
    echo "::error::$name p95 is $change against the base (fails above +${fail}%)"
    status=1
  else
    echo "::warning::$name p95 is $change against the base (reported above +${warn}%)"
  fi
done <<<"$verdicts"
exit $status
