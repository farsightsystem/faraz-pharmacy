# PM2 Guide — Express Server Management

## Installation

```bash
npm install -g pm2
```

Verify:

```bash
pm2 --version
```

## Starting a Server

### Basic start

```bash
pm2 start dist/server.js --name my-app
```

### With tsx (for ESM/.js extension issues)

```bash
pm2 start dist/server.js --interpreter tsx --name my-app
```

### With environment variables

```bash
pm2 start dist/server.js --name my-app --env NODE_ENV=production
```

### Start from project root

```bash
cd /path/to/my-app && pm2 start dist/server.js --name my-app
```

## Common Commands

### List all processes

```bash
pm2 list
pm2 ls           # shorthand
pm2 status       # alternative
```

### View logs

```bash
pm2 logs                    # tail all logs
pm2 logs my-app             # tail specific app logs
pm2 logs my-app --lines 50  # show last 50 lines
pm2 logs my-app --nostream  # print once, don't follow
```

### Stop a process

```bash
pm2 stop my-app        # stop by name
pm2 stop 0             # stop by ID
pm2 stop all           # stop everything
```

### Restart a process

```bash
pm2 restart my-app     # stop + start
pm2 restart all
```

### Reload a process (zero-downtime)

```bash
pm2 reload my-app
```

### Delete a process

```bash
pm2 delete my-app      # remove from PM2 list
pm2 delete 0           # by ID
pm2 delete all         # remove all processes
```


---


### Quick Reference (Windows)

* `npm i -g pm2` — Install PM2 globally
* `pm2 start ecosystem.config.cjs` — Start app via ecosystem config
* `pm2 list` — List running processes
* `pm2 logs [app-name]` — View application logs
* `pm2 restart [app-name]` — Restart process
* `pm2 save` — Save current process list
* `npx pm2-windows-startup install` — Enable auto-start on Windows reboot
* `pm2 monit` — Open live resource dashboard


### Monitor processes (live dashboard)

```bash
pm2 monit
```

Press `Ctrl+C` to exit.

### Show process details

```bash
pm2 show my-app
pm2 describe my-app
```

### View process metrics

```bash
pm2 list
pm2 prettylist
```

## Ecosystem File (Recommended for Production)

Save config to `ecosystem.config.js` in your project root:

```js
module.exports = {
  apps: [
    {
      name: "faraz-server",
      script: "dist/server.js",
      interpreter: "tsx",
      env: {
        NODE_ENV: "production"
      },
      watch: false,
      max_memory_restart: "500M"
    }
  ]
};
```

Then start with:

```bash
pm2 start ecosystem.config.js
```

**Benefits:** config in version control, reproducible, multi-app support.

## Save & Restore Process List

Save the current PM2 process list so it survives machine reboots:

```bash
pm2 save
```

Restore on reboot:

```bash
pm2 resurrect
```

Or set PM2 to auto-start on system boot:

```bash
pm2 startup   # follow the printed instructions
```

## Advanced

### Max memory restart

```bash
pm2 start dist/server.js --name my-app --max-memory-restart 500M
```

### Cluster mode (multi-core)

```bash
pm2 start dist/server.js --name my-app -i max
```

### Log rotation

Install:

```bash
pm2 install pm2-logrotate
```

### Clear logs

```bash
pm2 flush          # clear all logs
pm2 flush my-app   # clear specific app logs
```

## Troubleshooting

| Issue | Fix |
|---|---|
| `Error: Cannot find module` or ESM `.js` issues | Use `--interpreter tsx` |
| PM2 starts process but it exits immediately | Check `pm2 logs my-app` for errors |
| `pm2 list` shows `errored` | Run `pm2 restart my-app`, check logs |
| Port already in use | Find process: `lsof -i :3001`, kill it, then restart |
| Accidentally created two processes (e.g. `tsx` + `server`) | `pm2 delete all && pm2 start ...` with correct command |

## Quick Reference

```bash
npm i -g pm2                          # install
pm2 start dist/server.js --name app   # start
pm2 list                              # list
pm2 logs app                          # logs
pm2 restart app                       # restart
pm2 stop app                          # stop
pm2 delete app                        # remove
pm2 delete all                        # remove all
pm2 save                              # persist list
pm2 startup                           # boot on restart
pm2 monit                             # live dashboard
```
