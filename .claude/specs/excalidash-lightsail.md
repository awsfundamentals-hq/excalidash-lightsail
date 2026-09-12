# ExcaliDash on AWS Lightsail
> Created: 2026-09-12

Self-hosted Excalidraw+ replacement. One Lightsail instance in eu-central-1 runs
ExcaliDash with Docker Compose. AWS CDK creates every AWS resource. The repo will
be open-sourced under MIT once it works.

## Decisions (settled, do not reopen)

| Area | Decision |
|---|---|
| Runtime | Lightsail instance, blueprint `ubuntu_24_04`, bundle `micro_3_0` (1 GB, 2 vCPU, 40 GB, USD 7/mo), region `eu-central-1` |
| App | Upstream images `zimengxiong/excalidash-backend` and `zimengxiong/excalidash-frontend`, pinned to `0.6.0` |
| IaC | AWS CDK v2, TypeScript, pnpm. Deployed locally with the AWS Fundamentals prod SSO profile |
| Network | Static IP. Firewall opens 22, 80, 443 to `0.0.0.0/0`. Regional default Lightsail key pair |
| Hostname | `draw.awsfundamentals.com`, grey-cloud A record, added by hand in awsf-infra Terraform |
| TLS | Caddy container in front of the ExcaliDash frontend. Let's Encrypt via HTTP-01 |
| Auth | `AUTH_MODE=local`, registration closed (DB default), first admin via bootstrap code from backend logs. No second gate |
| Data | SQLite at `/opt/excalidash/data/prisma/dev.db` on the instance disk. Images inside SQLite |
| Secrets | `JWT_SECRET` and `CSRF_SECRET` generated with openssl on first boot, stored as `secrets.env` in a Lightsail bucket, downloaded on every boot |
| Backups | Lightsail daily auto snapshot add-on. ExcaliDash `BACKUP_SCHEDULE` nightly SQLite copy, synced to the Lightsail bucket by cron, pruned after 30 days |
| Provisioning | Instance `UserData` (cloud-init) installs Docker, AWS CLI, writes compose and Caddyfile, starts the stack |
| Updates | `scripts/update.sh` run over SSH. Takes a backup, bumps the tag, pulls, restarts |
| Restore | Manual steps in README, no script |
| Monitoring | Lightsail alarms: `StatusCheckFailed_Instance` and `CPUUtilization`, email to alessandro.volpicella@gmail.com |
| CI | None |
| License | MIT |

Facts that shaped the design:

- Lightsail instances have no IAM role. The Lightsail bucket `ResourcesReceivingAccess` property gives the instance keyless access to the bucket.
- ExcaliDash supports one backend replica only. SQLite is the recommended path.
- `UserData` runs on first launch only. Changing it in CDK does not re-run it on the existing instance.
- Lightsail email contact methods must be verified once by clicking a link in the email. CloudFormation cannot do that.

---

## F-001: CDK project scaffold

**Group:** repo-scaffold
**Category:** technical
**Status:** - [ ] pending

The repo is a pnpm TypeScript AWS CDK v2 app. `bin/excalidash-lightsail.ts` instantiates one stack `ExcalidashLightsailStack` in `eu-central-1`. Account and region come from `CDK_DEFAULT_ACCOUNT` and a hard-coded region. No other stacks.

**Steps:**
1. Run `pnpm install`.
2. Run `pnpm cdk synth`.
3. Verify a template is written to `cdk.out/` with no errors.
4. Verify `pnpm typecheck` and `pnpm lint` pass.

**Notes:** Use `aws-cdk-lib` L1 constructs from `aws_lightsail` (`CfnInstance`, `CfnStaticIp`, `CfnBucket`, `CfnAlarm`). No L2 exists for Lightsail. Scripts in `package.json`: `typecheck`, `lint`, `synth`, `deploy`, `diff`, `destroy`. pnpm only, never npm or yarn.

## F-002: Repo hygiene for open source

**Group:** repo-scaffold
**Category:** technical
**Status:** - [ ] pending

The repo ships `LICENSE` (MIT, copyright AWS Fundamentals), `.gitignore` (node_modules, cdk.out, `.env*`, `*.pem`), `.nvmrc` or `engines` field, and `README.md`. Nothing secret is ever committed. No AI attribution anywhere.

**Steps:**
1. Run `git grep -iE 'secret=|AKIA|BEGIN .*PRIVATE KEY'` and verify no matches outside example placeholders.
2. Verify `LICENSE` is MIT.
3. Verify `.gitignore` covers `cdk.out/`, `node_modules/`, `.env`, `*.pem`.

**Notes:** Repo stays private on GitHub until the owner flips it. Do not add `Co-Authored-By` or "Generated with" lines to commits.

## F-003: Stack configuration via context

**Group:** repo-scaffold
**Category:** technical
**Status:** - [ ] pending

All tunables live in one typed config object read from `cdk.json` context with defaults: `hostname` (`draw.awsfundamentals.com`), `alarmEmail`, `bundleId` (`micro_3_0`), `blueprintId` (`ubuntu_24_04`), `excalidashVersion` (`0.6.0`), `bucketName`, `instanceName` (`excalidash`), `backupRetentionDays` (30). Overrides come from `cdk deploy -c key=value`.

**Steps:**
1. Run `pnpm cdk synth -c hostname=test.example.com`.
2. Verify the user-data script in the template contains `test.example.com`.
3. Run `pnpm cdk synth` with no context and verify the defaults appear.

**Notes:** Keep it a plain object, no config library. Validate `hostname` is a bare FQDN, no scheme.

## F-004: Lightsail instance

**Group:** lightsail-stack
**Category:** technical
**Status:** - [ ] pending

The stack creates one `AWS::Lightsail::Instance` named from config, blueprint `ubuntu_24_04`, bundle `micro_3_0`, availability zone `eu-central-1a`. `KeyPairName` is omitted so the regional default key is used. Tags: `project=excalidash`, `managed-by=cdk`.

**Steps:**
1. Run `pnpm cdk deploy` with the prod SSO profile.
2. Run `aws lightsail get-instance --instance-name excalidash --region eu-central-1`.
3. Verify `blueprintId`, `bundleId`, state `running`, and tags.

**Notes:** `BlueprintId` and `BundleId` cannot be updated in place. Changing them replaces the instance and loses the disk. The README warns about this.

## F-005: Firewall ports

**Group:** lightsail-stack
**Category:** security
**Status:** - [ ] pending

The instance `Networking.Ports` opens exactly TCP 22, 80, and 443 from `0.0.0.0/0` and `::/0`. No other port is open. Defaults are not relied on because specifying any port disables the defaults.

**Steps:**
1. Run `aws lightsail get-instance-port-states --instance-name excalidash --region eu-central-1`.
2. Verify only 22, 80, 443 are `open`.
3. Run `nc -zv <static-ip> 6767` and verify it is refused or times out.
4. Run `nc -zv <static-ip> 8000` and verify it is refused or times out.

**Notes:** Port 22 stays world-open by decision. Key auth only; password auth is off on the Ubuntu blueprint by default.

## F-006: Static IP

**Group:** lightsail-stack
**Category:** technical
**Status:** - [ ] pending

The stack creates an `AWS::Lightsail::StaticIp` and attaches it to the instance with `AttachedTo`. The IP is a stack output `PublicIp`. The README tells the operator to put this IP into the Cloudflare A record.

**Steps:**
1. Run `pnpm cdk deploy` and read the `PublicIp` output.
2. Run `aws lightsail get-static-ip --static-ip-name excalidash-ip --region eu-central-1`.
3. Verify `isAttached` is true and `attachedTo` is `excalidash`.
4. Reboot the instance and verify the IP is unchanged.

**Notes:** The static IP resource must depend on the instance. The instance must be `running` for attach to succeed.

## F-007: Daily auto snapshots

**Group:** lightsail-stack
**Category:** technical
**Status:** - [ ] pending

The instance has the `AutoSnapshot` add-on enabled with `SnapshotTimeOfDay` `03:00` UTC. Lightsail keeps the last 7 daily snapshots for free.

**Steps:**
1. Run `aws lightsail get-auto-snapshots --resource-name excalidash --region eu-central-1` two days after deploy.
3. Verify at least one snapshot exists with status `Success`.

**Notes:** The app backup in F-014 runs at 04:00 UTC, one hour after the disk snapshot. Order does not matter, both are independent.

## F-008: Lightsail bucket with instance access

**Group:** lightsail-stack
**Category:** technical
**Status:** - [ ] pending

The stack creates an `AWS::Lightsail::Bucket` with bundle `small_1_0` (5 GB, USD 1/mo), `ObjectVersioning` false, access rules private, and `ResourcesReceivingAccess` set to the instance name. The bucket name is a stack output `BucketName`.

**Steps:**
1. SSH into the instance.
2. Run `aws s3 ls s3://<bucket> --region eu-central-1` with no configured credentials.
3. Verify the command succeeds (empty listing is fine).
4. Run the same command from your laptop with no profile and verify it fails with access denied.

**Notes:** Bucket must be in the same region as the instance. The bucket resource must depend on the instance because it references it by name. Bucket names are global and 3-54 chars, so default to `excalidash-<account-id-suffix>` or take it from context.

## F-009: Instance alarms

**Group:** lightsail-stack
**Category:** technical
**Status:** - [ ] pending

Two `AWS::Lightsail::Alarm` resources monitor the instance. `excalidash-status-check`: metric `StatusCheckFailed_Instance`, `GreaterThanOrEqualToThreshold` 1, 2 evaluation periods, `TreatMissingData` `breaching`. `excalidash-cpu`: metric `CPUUtilization`, `GreaterThanOrEqualToThreshold` 90, 3 evaluation periods. Both have `ContactProtocols` `["Email"]`, `NotificationTriggers` `["ALARM", "OK"]`, `NotificationEnabled` true.

**Steps:**
1. Run `aws lightsail get-alarms --region eu-central-1`.
2. Verify both alarms exist and are in `OK` after 15 minutes.
3. Run `stress-ng --cpu 2 --timeout 20m` on the instance (or `yes > /dev/null &` twice) and verify a CPU alarm email arrives.

**Notes:** Alarm emails only send after the contact method in F-010 is verified. Without it the alarm still exists but is silent.

## F-010: Email contact method (manual, documented)

**Group:** lightsail-stack
**Category:** integration
**Status:** - [ ] pending

The README documents the one-time manual step: create an Email contact method in `eu-central-1` with `aws lightsail create-contact-method --protocol Email --contact-endpoint alessandro.volpicella@gmail.com --region eu-central-1`, then click the verification link in the email. CDK does not create it because verification cannot be automated.

**Steps:**
1. Follow the README step.
2. Run `aws lightsail get-contact-methods --region eu-central-1`.
3. Verify status is `Valid`.

**Notes:** Contact methods are per region. One per protocol per region.

## F-011: Stack outputs

**Group:** lightsail-stack
**Category:** technical
**Status:** - [ ] pending

The stack outputs `PublicIp`, `BucketName`, `InstanceName`, `SshCommand` (`ssh -i ~/.ssh/LightsailDefaultKey-eu-central-1.pem ubuntu@<ip>`), and `Hostname`.

**Steps:**
1. Run `pnpm cdk deploy`.
2. Verify all five outputs are printed.
3. Copy `SshCommand`, run it, and verify a shell opens.

**Notes:** The default key is downloaded once from the Lightsail console, Account page, SSH keys. README says where.

## F-012: User data installs the runtime

**Group:** bootstrap
**Category:** technical
**Status:** - [ ] pending

The user-data script is a bash file in `assets/user-data.sh` templated by CDK with config values. On first boot it: sets `set -euo pipefail` and logs to `/var/log/excalidash-bootstrap.log`; installs Docker Engine and the compose plugin from Docker's apt repo; installs AWS CLI v2; creates `/opt/excalidash` with `data/prisma`, `data/backups`, `caddy/data`, `caddy/config`; adds user `ubuntu` to the `docker` group.

**Steps:**
1. Deploy a fresh instance.
2. Wait 5 minutes, SSH in.
3. Run `docker --version && docker compose version && aws --version`.
4. Verify all three print versions.
5. Run `tail -50 /var/log/excalidash-bootstrap.log` and verify it ends with a success line.

**Notes:** Use `cloud-init` semantics: the script runs once as root. Make it idempotent anyway so it can be re-run by hand after a change. Templating: use string replacement of `__HOSTNAME__`, `__BUCKET__`, `__VERSION__`, `__RETENTION_DAYS__` tokens in CDK, not shell heredoc escaping.

## F-013: Secrets from the bucket

**Group:** bootstrap
**Category:** security
**Status:** - [ ] pending

On every boot a systemd oneshot `excalidash-secrets.service` (before `excalidash.service`) runs `/opt/excalidash/bin/fetch-secrets.sh`. It tries `aws s3 cp s3://<bucket>/secrets.env /opt/excalidash/secrets.env`. If the object is missing it generates `JWT_SECRET` and `CSRF_SECRET` with `openssl rand -hex 32`, writes the file with mode 600, and uploads it. The compose file loads it with `env_file`.

**Steps:**
1. On a fresh deploy, verify `aws s3 ls s3://<bucket>/secrets.env` shows the object after boot.
2. Verify `/opt/excalidash/secrets.env` has mode `600`, owner root, and two lines.
3. Log in to ExcaliDash. Reboot the instance. Reload the browser.
4. Verify the session is still valid (no new login).
5. Destroy and redeploy the instance while keeping the bucket. Verify the same secrets are downloaded (compare `sha256sum`).

**Notes:** Never echo secrets to the bootstrap log. Bucket destruction in `cdk destroy` must be blocked: set `removalPolicy`-equivalent by `DeletionPolicy: Retain` on the bucket. Document that the bucket must be deleted by hand.

## F-014: Docker Compose stack

**Group:** bootstrap
**Category:** technical
**Status:** - [ ] pending

`/opt/excalidash/docker-compose.yml` defines three services. `backend`: image `zimengxiong/excalidash-backend:0.6.0`, `init: true`, env `DATABASE_PROVIDER=sqlite`, `DATABASE_URL=file:/app/prisma/dev.db`, `PORT=8000`, `NODE_ENV=production`, `AUTH_MODE=local`, `FRONTEND_URL=https://<hostname>`, `TRUST_PROXY=1`, `BACKUP_SCHEDULE=0 0 4 * * *`, `BACKUP_DIR=/app/backups`, `BACKUP_RETENTION_DAYS=14`, `UPDATE_CHECK_OUTBOUND=false`, `env_file: secrets.env`, volumes `./data/prisma:/app/prisma` and `./data/backups:/app/backups`, health check on `/health`. `frontend`: image `zimengxiong/excalidash-frontend:0.6.0`, no host port, depends on backend. `caddy`: image `caddy:2`, ports `80:80` and `443:443`, volumes for `Caddyfile`, `caddy/data`, `caddy/config`. All `restart: unless-stopped`. A systemd unit `excalidash.service` runs `docker compose up -d` on boot.

**Steps:**
1. SSH in, run `docker compose -f /opt/excalidash/docker-compose.yml ps`.
2. Verify three containers are `running` and backend is `healthy`.
3. Run `docker compose logs backend | grep -A12 'STORAGE'`.
4. Verify it shows `Database: sqlite`, `File storage: database (default)`, `Backups: on`.
5. Reboot. Verify all three containers come back without manual action.

**Notes:** Bind mounts, not named volumes, so backups and snapshots are plain files. The doc example for `TRUST_PROXY=1` assumes one hop (frontend nginx to backend). With Caddy in front there may be two hops. Verify in F-018 that the backend logs the real client IP on login. If it logs the docker network IP, set `TRUST_PROXY=2`. If HTTPS redirect loops appear, set `ENFORCE_HTTPS_REDIRECT=false`.

## F-015: Caddy reverse proxy with TLS

**Group:** bootstrap
**Category:** security
**Status:** - [ ] pending

`/opt/excalidash/Caddyfile` contains one site block for `<hostname>` that does `reverse_proxy frontend:80`. Caddy obtains and renews the Let's Encrypt certificate on its own via HTTP-01 on port 80. HTTP redirects to HTTPS. WebSocket upgrade passes through with no extra config.

**Steps:**
1. After DNS points at the static IP, wait 2 minutes.
2. Run `curl -sI https://<hostname>` and verify `HTTP/2 200` and no certificate warning.
3. Run `curl -sI http://<hostname>` and verify a 308 redirect to https.
4. Run `openssl s_client -connect <hostname>:443 -servername <hostname> </dev/null 2>/dev/null | openssl x509 -noout -issuer` and verify the issuer is Let's Encrypt.

**Notes:** Caddy must start after DNS resolves, otherwise ACME fails and retries with backoff. That is fine. The Cloudflare record must be DNS-only (grey cloud) or HTTP-01 fails.

## F-016: Nightly backup sync to the bucket

**Group:** backup
**Category:** technical
**Status:** - [ ] pending

A root cron entry at `04:30` UTC runs `/opt/excalidash/bin/backup-sync.sh`. It runs `aws s3 sync /opt/excalidash/data/backups s3://<bucket>/backups/ --region eu-central-1`, then deletes bucket objects under `backups/` older than 30 days using `aws s3 ls` and `LastModified`. It logs to `/var/log/excalidash-backup.log`.

**Steps:**
1. Run `/opt/excalidash/bin/backup-sync.sh` by hand after the first 04:00 ExcaliDash backup.
2. Run `aws s3 ls s3://<bucket>/backups/` and verify at least one `.db` or archive file.
3. Create a file in the bucket with a mtime older than 30 days is not possible, so instead set `RETENTION_DAYS=0` in a dry run and verify the prune logic selects all files and `--dry-run` prints them without deleting.
4. Check `/var/log/excalidash-backup.log` for a timestamped success line.

**Notes:** The ExcaliDash backup file name format is decided by upstream. Sync whatever lands in `BACKUP_DIR`. Also sync `secrets.env` is not needed, it is already in the bucket. Do not sync `caddy/data`; certificates re-issue.

## F-017: Update script

**Group:** ops
**Category:** functional
**Status:** - [ ] pending

`scripts/update.sh` is copied to `/opt/excalidash/bin/update.sh` by user data and also lives in the repo. Usage: `sudo /opt/excalidash/bin/update.sh 0.6.1`. It: refuses to run without a version argument; runs a SQLite backup by calling the ExcaliDash backup (or `sqlite3 .backup` fallback) and syncs it to the bucket; rewrites the image tags in `docker-compose.yml` with `sed`; runs `docker compose pull` and `docker compose up -d`; waits for backend `healthy`; prints the new `STORAGE` block from logs.

**Steps:**
1. Run `sudo /opt/excalidash/bin/update.sh` with no argument and verify it exits 1 with usage.
2. Run `sudo /opt/excalidash/bin/update.sh 0.6.0` (same version) and verify it completes and the stack is healthy.
3. Verify a new backup object appeared in the bucket.
4. Run `docker compose images` and verify the tag matches.

**Notes:** Upstream migrations run in the backend entrypoint on start. Nothing else to do. Keep the script POSIX-ish bash, no external deps beyond docker, aws, sed.

## F-018: Login gate and closed registration

**Group:** auth
**Category:** security
**Status:** - [ ] pending

An anonymous visitor to `https://<hostname>` sees the login page and nothing else. The register endpoint returns 403 once the first admin exists. The admin creates further users in Admin, Access Control. The rate limiter sees the real client IP.

**Steps:**
1. Open `https://<hostname>` in a private window. Verify the login page appears and no drawing list is visible.
2. Run `curl -s https://<hostname>/api/drawings` and verify 401.
3. After the first admin exists, `POST /api/auth/register` with a valid body (and CSRF token) and verify 403 "User registration is disabled."
4. Log in as admin, open Admin, Access Control. Verify "Registration" is off.
5. Fail login 10 times from your laptop and verify a 429 appears. Then check backend logs for your public IP, not `172.x`. If `172.x`, apply the `TRUST_PROXY` note in F-014.

**Notes:** `registrationEnabled` defaults to false in the Prisma schema. Do not set `DISABLE_ONBOARDING_GATE`.

## F-019: First admin bootstrap runbook

**Group:** auth
**Category:** ux
**Status:** - [ ] pending

The README has a "First login" section: SSH in, run `docker compose logs backend --tail=200 | grep "BOOTSTRAP SETUP"`, open `https://<hostname>`, register with the code within 15 minutes. If it expired, the log shows a new code after a failed attempt.

**Steps:**
1. Follow the README section on a fresh deploy.
2. Verify the account is created with role ADMIN.
3. Verify the Admin page is reachable.

**Notes:** Code TTL is 15 minutes (`BOOTSTRAP_SETUP_CODE_TTL_MS`). Max 10 attempts.

## F-020: DNS runbook

**Group:** ops
**Category:** integration
**Status:** - [ ] pending

The README has a "DNS" section: add an A record `draw` in `awsf-infra/apps/cdn-infra-terraform/modules/dns/awsf_cloudflare.tf` pointing at the `PublicIp` output, `proxied = false`, then `terraform apply` from `accounts/prod/`. The section states that Caddy only gets a certificate after this record resolves.

**Steps:**
1. Run `dig +short draw.awsfundamentals.com` and verify it returns the static IP.
2. Run `dig +short draw.awsfundamentals.com @1.1.1.1` and verify the same IP (not a Cloudflare proxy IP).

**Notes:** The OSS README phrases this generically ("create an A record at your DNS provider") with a private note for the awsf-infra path kept in `docs/internal.md` that is gitignored, or simply in the awsf-infra repo. Decide at implementation, but do not leak internal repo paths in the public README.

## F-021: Restore runbook

**Group:** ops
**Category:** ux
**Status:** - [ ] pending

The README has a "Restore" section with two paths. Path A, whole instance: create a new instance from a Lightsail auto snapshot in the console, re-attach the static IP, done. Path B, database only: `docker compose stop backend`, `aws s3 cp s3://<bucket>/backups/<file> /tmp/`, replace `/opt/excalidash/data/prisma/dev.db` (keep the old one as `.bak`), `docker compose start backend`, verify drawings load.

**Steps:**
1. Create a test drawing named `restore-check`.
2. Trigger a backup and sync.
3. Delete the drawing in the UI.
4. Follow Path B with the backup taken in step 2.
5. Verify `restore-check` is back.

**Notes:** Path A loses everything written after the snapshot time. Say so.

## F-022: README

**Group:** docs
**Category:** ux
**Status:** - [ ] pending

`README.md` has, in order: what this is and why (Excalidraw+ is not self-hostable today); architecture diagram (Mermaid: browser, Cloudflare DNS, Caddy, frontend, backend, SQLite, bucket, snapshots); monthly cost table (instance 7, bucket 1, snapshots 0, static IP 0 while attached, total USD 8); prerequisites (Node 22, pnpm, AWS CLI, CDK bootstrap, SSO profile); deploy steps; DNS; first login; backups and restore; updates; alarms contact step; what is not covered (HA, Postgres, OIDC); license.

**Steps:**
1. Give the README to someone who has not seen the repo.
2. Verify they can deploy end to end without asking a question.

**Notes:** Prose style: short sentences, active voice, no filler. Keep the ExcaliDash upstream link and LGPL note in a "Credits" line.

## F-023: End-to-end acceptance

**Group:** verification
**Category:** functional
**Status:** - [ ] pending

The full deployment works for two users drawing together over the public hostname.

**Steps:**
1. Log in as admin in browser A. Create user `bob` in Admin.
2. Log in as `bob` in browser B (private window).
3. Admin creates a drawing and shares it with `bob` with edit rights.
4. Both open it. Admin draws a rectangle. Verify it appears in B within 2 seconds.
5. Upload a PNG into the drawing. Reload both browsers. Verify the image persists.
6. Export the drawing as `.excalidraw`, open it on excalidraw.com, verify it renders.
7. Reboot the instance. Verify the drawing and image are still there and both sessions are still valid.

**Notes:** This is the definition of done for the first release.

## F-024: Teardown

**Group:** ops
**Category:** technical
**Status:** - [ ] pending

`pnpm cdk destroy` removes instance, static IP, and alarms. The bucket is retained by `DeletionPolicy: Retain` and must be emptied and deleted by hand. The README says so, and lists the two commands.

**Steps:**
1. Run `pnpm cdk destroy` on a throwaway deploy.
2. Verify the instance and static IP are gone.
3. Verify the bucket still exists with `secrets.env` and `backups/`.
4. Run the documented delete commands and verify the bucket is gone.

**Notes:** Auto snapshots are deleted with the instance. Warn that a destroy without a bucket backup is data loss.
