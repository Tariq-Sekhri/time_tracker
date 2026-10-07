# Trend model compute comparison

This benchmark uses synthetic categories and app titles. It never accesses a database or the installed app. It compares the original chart functions from commit `2c2c7706d6633aefbd3759a19640dbfdb22f6d05` with the current functions on identical inputs, checks equal values/order/colors, warms each function ten times, and averages 200 runs. The fixture has 24 weeks, 30 categories and 1,000 apps per week; top-app mode selects 20 apps.

Run from the desktop project folder in PowerShell:

```powershell
$env:RUN_FRONTEND_BENCHMARK = "1"
npm test -- scripts/performance/frontend.benchmark.test.js
Remove-Item Env:RUN_FRONTEND_BENCHMARK
```

Results are printed and saved in `docs/performance/frontend-series.json`. It is skipped in normal test runs. This measures chart data calculations only; IPC, React/Recharts rendering and paint require separate native dev timing. Runtime and machine load affect the absolute numbers.

The production baseline usually spent approximately 1.5 milliseconds building category series. Avoiding repeated builds and database calls matters more to the whole-screen experience than saving one millisecond in isolation. Stable query data/filter references and chart memoization skip unchanged calculations; cached date formatting and stable top-k selection reduce each actual calculation. The dotted-gap layer groups all straight connectors into at most ten SVG paths rather than mounting one Recharts Line per gap.
