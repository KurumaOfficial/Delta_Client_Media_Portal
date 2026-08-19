# Maximum Memory & Runtime Optimization Guide

## Delta Free Media Application Architecture & Memory Management

This project has been engineered specifically for maximum performance and minimal memory footprint in idle and operational states.

### Key Optimization Measures Applied:

1. **Go Runtime & Garbage Collection Tuning**:
   - `debug.SetGCPercent(20)`: Triggers GC aggressively to ensure allocated memory buffers are freed back to the system immediately.
   - `debug.SetMaxThreads(15)`: Prevents excessive OS thread creation by the Go runtime scheduler.
   - `runtime.GOMAXPROCS(2)`: Caps parallel core allocations to keep CPU cache and thread stacks tight.

2. **Fiber v2 / Fasthttp Zero-Allocation Networking**:
   - Built on `gofiber/fiber/v2` which utilizes zero-allocation byte slice management via `fasthttp`.
   - Streaming request body parsing (`StreamRequestBody: true`) to avoid copying large upload payloads into RAM.
   - Response compression via GZip/Brotli stream middleware.

3. **Lightweight Database Layer (Pure-Go SQLite)**:
   - Configured with `modernc.org/sqlite` / `glebarez/go-sqlite` (no CGO overhead).
   - Connection pool tuned to `SetMaxOpenConns(2)` and `SetMaxIdleConns(2)` to eliminate connection overhead.
   - Optimized SQLite PRAGMAs:
     - `journal_mode=WAL` (Write-Ahead Logging for high concurrency).
     - `synchronous=NORMAL`.
     - `cache_size=-2000` (caps DB RAM cache at ~2MB maximum).

4. **Binary & Asset Optimization**:
   - Static assets (HTML, CSS, JS) served with HTTP caching and compressed headers.
   - Go binary compiled with `-ldflags="-s -w"` stripping symbol tables and debug information to minimize binary footprint.

### How to Run with Environment Tuning:

```bash
# Set environment variables
$env:PORT="3000"
$env:ADMIN_SECRET="admin123"
$env:GC_TUNING="true"

# Launch binary
.\delta-portal.exe
```
