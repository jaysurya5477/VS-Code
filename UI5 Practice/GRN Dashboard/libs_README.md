# webapp/libs

Third-party browser libraries that ship **inside** the app.

| File | Version | Source |
|---|---|---|
| `echarts.min.js` | 5.5.0 | `npm i echarts@5.5.0` → `node_modules/echarts/dist/echarts.min.js` |

## Why it is vendored instead of loaded from a CDN

The HTML prototype (`GRN Dashboard v2.dc.html`) pulls ECharts from
`cdn.jsdelivr.net`. That cannot survive deployment: once the app is served as a BSP
application from the ABAP server and embedded in the Fiori Launchpad, the Launchpad's
Content-Security-Policy blocks scripts from third-party origins, and most customer
networks block outbound internet from the browser session anyway. So the bundle is
committed here and loaded same-origin by `model/echartsLoader.js`.

`ui5 build` copies everything under `webapp/` into `dist/`, so no build config is needed
for this to reach the ABAP repository — but note it makes the deployed app ~1 MB larger.

## Upgrading

```
npm i echarts@<new-version> --no-save
cp node_modules/echarts/dist/echarts.min.js webapp/libs/echarts.min.js
```

Then update the version in the table above. Do not hand-edit `echarts.min.js`.
