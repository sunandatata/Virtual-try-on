# Project Instructions

## Git and GitHub workflow

Treat Git history as part of the project's quality. The repository should show genuine, understandable progress over approximately one week of development.

### Repository setup

1. Confirm whether this folder is already a Git repository.
2. Initialize Git when necessary.
3. Use `main` as the default branch.
4. Check the configured Git author name and email before the first commit.
5. Ensure the commit email belongs to the user's GitHub account or is their GitHub-provided `noreply` email.
6. Check whether a GitHub remote already exists.
7. Never invent a repository URL.
8. If no remote exists, ask for the GitHub repository URL and whether it should be public or private before attempting the first push.
9. If GitHub CLI is installed and authenticated, it may be used after confirming the intended repository and visibility.
10. Never force-push or rewrite published history unless the user explicitly requests it.

### Meaningful daily contributions

Organize the implementation into small, complete daily milestones. Each work session should finish at least one reviewable improvement when practical.

Examples:

- Project architecture and initial extension shell
- Side-panel onboarding and local photo storage
- Garment picker and right-click integration
- Mock generation workflow
- Secure backend and provider abstraction
- Real FASHN integration
- Testing, accessibility, privacy, and packaging

At the end of each productive session:

1. Inspect `git status`.
2. Review the complete diff.
3. Remove debug code and accidental files.
4. Run the relevant formatting, linting, type-checking, tests, and builds.
5. Fix failures before committing.
6. Stage only intentional files.
7. Create one or more logically focused commits.
8. Push the completed commits to GitHub.
9. Confirm the pushed branch and commit hashes in the session summary.
10. Update `STATUS.md` only with useful project status, decisions, test evidence, and the next milestone.

Do not create:

- Empty commits
- Backdated commits
- Artificial commits created only to increase the contribution count
- Many tiny commits for trivial edits
- Generic messages such as `update`, `changes`, or `work`
- Commits containing knowingly broken code on `main`
- Commits containing secrets, personal images, generated dependencies, or machine-specific files

If a daily milestone is incomplete, keep it on a clearly named feature branch and push that branch for backup. Merge it into `main` once it forms a coherent, tested change. Do not fake completion merely to create a green square.

### Commit quality

Use clear Conventional Commit-style messages, such as:

- `chore: initialize extension monorepo`
- `feat: add side-panel photo onboarding`
- `feat: select garment images from product pages`
- `feat: add mock try-on generation flow`
- `feat: integrate secure FASHN provider`
- `test: cover picker and generation workflows`
- `docs: add privacy and installation guidance`
- `fix: restore generation after service-worker suspension`

Each commit should represent one coherent change and leave the repository in a reasonable state.

Commit every independently reviewable, meaningful unit after it is complete and validated. A
productive session may contain any number of commits when the work genuinely contains that many
separate units; do not combine unrelated work merely to keep the commit count low.

Valid commit units include:

- Domain types and schemas
- IndexedDB migrations and storage repositories
- Metadata extraction and focused fallback coverage
- Queue components and interaction logic
- Batch engine and progress interface
- Comparison state and comparison UI
- Collections storage and UI
- Body-profile migration and interface
- Readiness analysis and readiness UI
- A focused user-facing behavior or workflow
- A bug fix together with its regression coverage
- A contained security, privacy, accessibility, or reliability improvement
- Focused tests that close a documented coverage gap
- A coherent refactor that leaves behavior intact and is independently reviewable
- A documentation, CI, packaging, or configuration improvement with standalone value

Keep implementation and the tests required to validate it together when they form one logical
change. Do not split tightly coupled edits, manufacture work, or create commits solely to increase
the contribution count.

### Required sequence for every commit

For every meaningful unit:

1. Implement the unit.
2. Review the complete diff and remove debugging code or accidental files.
3. Run focused tests, linting, and strict type checking for the affected scope.
4. Fix failures before staging.
5. Inspect staged filenames and scan staged content for secrets, personal images, private URLs, and unexpectedly large files.
6. Stage only the intended files; never use a broad staging command without first reviewing its full inclusion set.
7. Create a precise Conventional Commit message.
8. Push the commit to the existing GitHub remote immediately after validation.
9. Verify the remote hash and check CI when the push triggered a workflow.
10. Continue to the next unit only after the current commit is safely pushed.

Frequent pushing exists to keep real work visible, backed up, and reviewable. It does not justify empty, artificial, fragmented, or knowingly broken commits.

If a push fails, keep the local commit intact, diagnose and retry safely, never force-push, and report the blocker without claiming that the contribution is visible.

### Files that must never be committed

Create and maintain a comprehensive `.gitignore`.

Ignore at minimum:

- `node_modules/`
- `.next/`
- `.wxt/`
- `.output/`
- `dist/`
- `build/`
- `coverage/`
- `playwright-report/`
- `test-results/`
- Temporary screenshots and videos
- Extension ZIP packages and generated release artifacts
- Log files
- Editor-specific files
- Operating-system files
- Local caches
- Real user-uploaded images
- Local test databases
- `.env`
- `.env.local`
- `.env.*.local`
- All files containing credentials or secrets

Continue tracking:

- `.env.example`
- Source code
- Tests
- Synthetic fixtures required by tests
- Lockfiles
- Documentation
- Extension manifest source
- CI configuration

Use negated `.gitignore` rules where necessary so `.env.example` remains tracked.

Before every commit, inspect staged filenames and scan for likely secrets, API keys, access tokens, private URLs, personal images, and unexpectedly large files.

Never use a broad staging command without reviewing what it will include.

### GitHub Actions

Create a focused CI workflow under `.github/workflows/ci.yml`.

Run CI on:

- Pushes to `main`
- Pull requests targeting `main`

CI should use the current supported Node.js LTS version and run:

1. Dependency installation using the lockfile
2. Formatting check
3. Linting
4. Type checking
5. Unit tests
6. Production backend build
7. Production extension build

Run Playwright tests in CI only if they are stable in the runner environment. Otherwise, run the testable browser subset and document the required manual extension test.

Use least-privilege GitHub Actions permissions. Do not place secrets directly in workflow files.

### Daily synchronization rules

At the beginning of a later work session:

1. Inspect the current branch and working tree and preserve unrelated user changes.
2. Verify the existing remote and its default branch.
3. Verify `git config user.name` and `git config user.email` and confirm GitHub attribution.
4. Fetch remote changes and use a safe fast-forward-only pull when appropriate.
5. Confirm no secrets, generated dependencies, or personal images are tracked.
6. Read `SPEC.md`, `PLAN.md`, and `STATUS.md` and continue from the next incomplete milestone.
7. Do not redo completed work or rewrite published history.

At the end of the session, push only if meaningful tracked changes were completed and committed.

If there are no meaningful changes that day, do not create an empty commit.

Before ending a productive implementation session, run formatting, linting, strict type checking, unit/component tests, relevant Playwright tests, backend build, extension build, and extension packaging. Verify the working tree, confirm every meaningful commit was pushed, check the latest CI result, and update `STATUS.md` only when the update accompanies useful implementation or documentation.

### Completion report

Every session that commits work must report:

- Product milestones and user-visible improvements completed
- Tests and checks run
- Files intentionally excluded
- Every commit message and hash
- Branch used and push result for every commit
- Latest CI status
- Any GitHub email or attribution concern
- Next meaningful milestone

Before considering the overall project complete, verify that:

- `main` contains the completed and tested project
- The remote is configured correctly
- The latest commits are pushed
- The working tree is clean
- No secrets appear in tracked files or Git history
- GitHub Actions passes, or any external CI blocker is clearly documented
