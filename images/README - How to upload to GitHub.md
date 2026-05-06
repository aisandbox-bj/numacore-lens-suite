# How to get the `images/` folder into your GitHub repo

Target repo: **aisandbox-bj / lens**
Target location: an `images/` folder at the same level as `index.html`
Result when done: references like `./images/haul-truck-rigid.png` in the HTML resolve correctly.

---

## Step 1 — Assemble all 10 files on your PC (5 minutes)

This folder (`Lens images for GitHub/`) already contains the 3 cropped files I produced:

- `haul-truck-adt.png`
- `loader-utility.png`
- `drill-surface-small.png`

You need to add the 7 renames. In File Explorer, go to:

`…\Numacore Lens (1)\Design Brief & Images\Images\Model Pictures\`

Rename **and copy** (not move — keep the originals intact) each of these 7 files into this `Lens images for GitHub/` folder:

| Rename this… | …to this |
|---|---|
| `holo_dump_truck_plain.png` | `haul-truck-rigid.png` |
| `holo_bulldozer.png` | `dozer.png` |
| `holo_excavator_a.png` | `excavator-standard.png` |
| `holo_excavator_large_mining.png` | `excavator-large.png` |
| `holo_wheel_loader_a.png` | `loader-wheel.png` |
| `holo_drill_rig.png` | `drill-surface-large.png` |
| `image (3).png` | `mine-pit.png` |

Fastest way: select the file in File Explorer, press **F2**, type the new name, Enter. Then right-click → Copy, navigate here, right-click → Paste.

When you're done, this folder should contain **exactly 10 PNGs** (plus this README, which you can ignore). Verify before uploading — if you have 9 or 11, something went wrong and the tool will have missing or surprise images.

---

## Step 2 — Upload them to GitHub (3 minutes, web UI only)

1. Open a browser, go to: **https://github.com/aisandbox-bj/lens**

2. You should see `index.html` and the green **Code** button. Above the file list, click the **"Add file"** dropdown → **"Upload files"**.

3. You'll land on an upload screen. **Before dragging anything**, look at the URL bar. You should see `…/lens/upload/main`. That tells you the files will land at the root of the repo (next to `index.html`). Good.

4. To create the `images/` folder *and* upload at the same time, we use a small trick. Look for the text box above the drop zone that says **"…type `/` to create a folder"** or similar. Type: **`images/`** (with the trailing slash). The breadcrumb above the drop zone will now show `lens / images`. Confirm.

5. Drag all 10 PNG files from your `Lens images for GitHub/` folder onto the drop zone. **Do NOT drag the folder itself** — drag the files. GitHub will list all 10 queued for commit.

6. Scroll down. Under **"Commit changes"**:
   - Commit message (top field): `Add hero images for Vitals unit view`
   - Leave the default "Commit directly to the main branch" selected
   - Click the green **"Commit changes"** button

7. GitHub will process for a few seconds, then drop you back on the repo homepage. You should now see a new `images` folder listed next to `index.html`. Click into it — all 10 files should be there.

---

## Step 3 — Verify the GitHub Pages URL resolves (1 minute)

Your repo is deployed via GitHub Pages. A file uploaded to the repo takes anywhere from 30 seconds to 2 minutes before it's served by Pages.

Wait a minute, then open a new browser tab and go to:

`https://aisandbox-bj.github.io/lens/images/haul-truck-rigid.png`

(Or whatever your Pages URL is — you can check it under the repo's **Settings → Pages** page.)

If you see the dump-truck holo image, every path will resolve and we're ready to start the build.
If you see a 404, wait 2 more minutes and retry. If it's still 404 after 5 minutes, something went sideways with the upload path — tell me and I'll troubleshoot.

---

## Known gotchas

- **Case sensitivity.** GitHub Pages serves files case-sensitively. `Images/` and `images/` are different paths. Use lowercase `images` exactly as written above.
- **Spaces.** None of the filenames have spaces. Don't add any.
- **File type.** All 10 files must be `.png`. If Windows hid the extension and you typed `haul-truck-rigid` without `.png`, the file will fail to serve.
- **One commit for all 10.** If you upload in batches, the intermediate states of the repo will have missing files. Not a disaster, but cleanest to do all 10 in one commit.

---

## If anything goes wrong

Don't guess. Take a screenshot of whatever GitHub is showing and I'll tell you what to do next.
