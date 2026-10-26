# Test a branch in GitHub Codespaces

A codespace builds the branch it is opened on and runs it as a throwaway
instance with invented content. It works from a phone's browser, so a pull
request can be tried before it is merged.

## Open one

1. On github.com, open the repository and switch to the branch you want
   (or open the pull request and pick its branch).
2. **Code** → **Codespaces** → **Create codespace on <branch>**.
3. Wait for the build (a few minutes the first time). The browser opens the
   instance on port 8420; otherwise open the **Ports** tab and tap the address.
4. Sign in as `ada@example.com` / `WikiPruefung2026!` (an invented account;
   the content is the wiki's screenshot data).

The address is private: only you, signed in to GitHub, can open it. Keep it
that way (Ports → right-click → Port visibility → Private).

## Update it

After new commits on the branch: in the codespace's terminal run
`git pull && .devcontainer/start.sh`, or stop and start the codespace.
Either way the instance is rebuilt from the current commit; the test data stays.

## Cost and cleanup

Codespaces stop after 30 idle minutes and count against GitHub's free monthly
allowance (this one uses 2 cores). Delete old ones under
github.com → Codespaces. Data in a codespace is throwaway: never copy a real
`salt.db` into one, because it runs on GitHub's machines.
