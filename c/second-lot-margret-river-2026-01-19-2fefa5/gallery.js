async function loadManifest() {
  // Bulletproof: resolves manifest.json against the current page URL
  const manifestUrl = new URL("manifest.json", window.location.href).toString();

  const res = await fetch(manifestUrl, { cache: "no-store" });
  if (!res.ok) throw new Error("manifest.json missing: " + manifestUrl);

  return res.json();
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v);
  });
  children.forEach((c) => node.appendChild(c));
  return node;
}

function humanIndex(i) {
  const n = String(i + 1).padStart(3, "0");
  return `Photo ${n}`;
}

async function downloadAllAsZip(zipName, images, button) {
  button.textContent = "Preparing ZIP...";
  button.style.pointerEvents = "none";

  const zip = new JSZip();

  for (let i = 0; i < images.length; i++) {
    const item = images[i];
    const url = item.url;
    const filename = item.filename || url.split("/").pop() || `image-${i + 1}.jpg`;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Failed fetching: " + url);
    const blob = await resp.blob();
    zip.file(filename, blob);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = zipName || "lowlight-gallery.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);

  button.textContent = "Download all (ZIP)";
  button.style.pointerEvents = "";
}

(async () => {
  const titleEl = document.getElementById("title");
  const metaEl = document.getElementById("meta");
  const noteEl = document.getElementById("note");
  const gridEl = document.getElementById("grid");
  const emptyEl = document.getElementById("empty");
  const openFolderEl = document.getElementById("openFolder");
  const downloadAllEl = document.getElementById("downloadAll");

  try {
    const manifest = await loadManifest();

    titleEl.textContent = manifest.title || "Client Gallery";
    metaEl.textContent = manifest.subtitle || "";
    noteEl.textContent = manifest.note || "";

    const images = Array.isArray(manifest.images) ? manifest.images : [];

    if (!images.length) {
      emptyEl.style.display = "block";
      return;
    }

    // folder link (simple/manual option)
    openFolderEl.href = manifest.openFolder || "./full/";

    // build tiles
    images.forEach((img, i) => {
      const fullUrl = img.url;
      const thumbUrl = img.thumb || img.url;
      const filename = img.filename || fullUrl.split("/").pop() || `image-${i + 1}.jpg`;

      const preview = el(
        "a",
        {
          class: "preview",
          href: fullUrl,
          target: "_blank",
          rel: "noopener",
        },
        [
          el("img", {
            src: thumbUrl,
            alt: img.alt || humanIndex(i),
            loading: "lazy",
            decoding: "async",
          }),
        ]
      );

      // Download button: uses HTML download attribute (clean + fast)
      const downloadBtn = el(
        "a",
        {
          class: "btn-mini",
          href: fullUrl,
          download: filename,
        },
        [document.createTextNode("Download")]
      );

      const viewBtn = el(
        "a",
        {
          class: "btn-mini btn-mini-ghost",
          href: fullUrl,
          target: "_blank",
          rel: "noopener",
        },
        [document.createTextNode("View")]
      );

      const tileBar = el("div", { class: "tile-bar" }, [
        el("div", { class: "chip" }, [document.createTextNode(humanIndex(i))]),
        el("div", { class: "tile-actions" }, [viewBtn, downloadBtn]),
      ]);

      const tile = el("div", { class: "tile" }, [preview, tileBar]);
      gridEl.appendChild(tile);
    });

    // ZIP download
    downloadAllEl.addEventListener("click", (e) => {
      e.preventDefault();
      downloadAllAsZip(manifest.zipName, images, downloadAllEl).catch((err) => {
        console.error(err);
        downloadAllEl.textContent = "ZIP failed (too many/big files)";
        setTimeout(() => (downloadAllEl.textContent = "Download all (ZIP)"), 2500);
      });
    });
  } catch (err) {
    console.error(err);
    emptyEl.style.display = "block";
    emptyEl.textContent = "Gallery not found (manifest.json missing).";
  }
})();
