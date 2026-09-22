(() => {
  const JPEG_QUALITY = 0.9;
  const WEBP_QUALITY = 0.9;
  const PATTERN_RE = /^(.*?)(\d+)$/;

  const state = {
    step: 1,
    files: [],
    /** @type {{ name: string, blob: Blob }[]} */
    converted: [],
    targetFormat: "jpg",
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const dropzone = $("#dropzone");
  const fileInput = $("#file-input");
  const fileList = $("#file-list");
  const convertBtn = $("#btn-convert");
  const formatSelect = $("#target-format");
  const patternInput = $("#pattern");
  const previewBox = $("#preview-box");
  const alertBox = $("#alert");
  const convertSummary = $("#convert-summary");
  const progressPanel = $("#progress-panel");
  const progressLabel = $("#progress-label");
  const progressEta = $("#progress-eta");
  const progressBar = $("#progress-bar");
  const progressTrack = progressPanel.querySelector(".progress-track");
  const progressCurrent = $("#progress-current");

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    if (totalSec < 1) return "less than 1s";
    if (totalSec < 60) return `about ${totalSec}s`;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return secs ? `about ${mins}m ${secs}s` : `about ${mins}m`;
  }

  function stemOf(filename) {
    const i = filename.lastIndexOf(".");
    return i > 0 ? filename.slice(0, i) : filename;
  }

  function parsePattern(pattern) {
    const trimmed = pattern.trim();
    if (!trimmed) throw new Error("Pattern cannot be empty");
    const m = PATTERN_RE.exec(trimmed);
    if (!m) throw new Error("Pattern must end with digits, e.g. '001' or 'abc_001'");
    return { prefix: m[1], start: Number(m[2]), width: m[2].length };
  }

  function previewNames(pattern, count, ext) {
    const { prefix, start, width } = parsePattern(pattern);
    const extension = ext.startsWith(".") ? ext : `.${ext}`;
    return Array.from({ length: count }, (_, i) => {
      return `${prefix}${String(start + i).padStart(width, "0")}${extension}`;
    });
  }

  function canvasToBmpBlob(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, w, h);
    const rowSize = Math.floor((24 * w + 31) / 32) * 4;
    const pixelBytes = rowSize * h;
    const fileSize = 54 + pixelBytes;
    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // BITMAPFILEHEADER
    view.setUint16(0, 0x4d42, true);
    view.setUint32(2, fileSize, true);
    view.setUint32(10, 54, true);
    // BITMAPINFOHEADER
    view.setUint32(14, 40, true);
    view.setInt32(18, w, true);
    view.setInt32(22, -h, true); // top-down
    view.setUint16(26, 1, true);
    view.setUint16(28, 24, true);
    view.setUint32(34, pixelBytes, true);

    const data = imageData.data;
    let offset = 54;
    for (let y = 0; y < h; y++) {
      let rowOffset = offset;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        bytes[rowOffset++] = data[i + 2];
        bytes[rowOffset++] = data[i + 1];
        bytes[rowOffset++] = data[i];
      }
      offset += rowSize;
    }

    return new Blob([buffer], { type: "image/bmp" });
  }

  function blobToCanvas(blob) {
    return new Promise(async (resolve, reject) => {
      try {
        if (typeof createImageBitmap === "function") {
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          resolve(canvas);
          return;
        }
      } catch (_) {
        /* fall through */
      }

      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not decode image"));
      };
      img.src = url;
    });
  }

  async function convertOne(file, format) {
    const canvas = await blobToCanvas(file);
    const needsWhiteBg = format === "jpg" || format === "bmp";
    if (needsWhiteBg) {
      const flat = document.createElement("canvas");
      flat.width = canvas.width;
      flat.height = canvas.height;
      const ctx = flat.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, flat.width, flat.height);
      ctx.drawImage(canvas, 0, 0);
      canvas.width = flat.width;
      canvas.height = flat.height;
      canvas.getContext("2d").drawImage(flat, 0, 0);
    }

    const stem = stemOf(file.name);
    if (format === "bmp") {
      return { name: `${stem}.bmp`, blob: canvasToBmpBlob(canvas) };
    }

    const mime =
      format === "jpg"
        ? "image/jpeg"
        : format === "png"
          ? "image/png"
          : "image/webp";
    const quality = format === "png" ? undefined : format === "webp" ? WEBP_QUALITY : JPEG_QUALITY;
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Conversion failed"))),
        mime,
        quality
      );
    });
    const ext = format === "jpg" ? "jpg" : format;
    return { name: `${stem}.${ext}`, blob };
  }

  function setStep(n) {
    state.step = n;
    $$(".panel").forEach((p) => p.classList.toggle("active", Number(p.dataset.step) === n));
    $$(".step-pill").forEach((pill) => {
      const s = Number(pill.dataset.step);
      pill.classList.toggle("active", s === n);
      pill.classList.toggle("done", s < n);
    });
    clearAlert();
  }

  function showAlert(message, type = "error") {
    alertBox.className = `alert alert-${type}`;
    alertBox.textContent = message;
    alertBox.classList.remove("hidden");
  }

  function clearAlert() {
    alertBox.classList.add("hidden");
    alertBox.textContent = "";
  }

  function setProgress(done, total, currentName, startedAt) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    progressLabel.textContent = `Converting ${done} of ${total}`;
    progressBar.style.width = `${pct}%`;
    progressTrack.setAttribute("aria-valuenow", String(pct));
    progressCurrent.textContent = currentName
      ? `Current: ${currentName}`
      : done >= total
        ? "Finishing…"
        : "Starting…";

    if (done === 0) {
      progressEta.textContent = "Estimating…";
      return;
    }
    const elapsed = performance.now() - startedAt;
    const remaining = Math.max(0, total - done);
    progressEta.textContent =
      remaining === 0 ? "Done" : `${formatDuration((elapsed / done) * remaining)} left`;
  }

  function showProgress(show) {
    progressPanel.classList.toggle("hidden", !show);
    if (!show) {
      progressBar.style.width = "0%";
      progressTrack.setAttribute("aria-valuenow", "0");
    }
  }

  function renderFiles() {
    fileList.innerHTML = "";
    if (!state.files.length) {
      convertBtn.disabled = true;
      return;
    }
    state.files.forEach((file, idx) => {
      const row = document.createElement("div");
      row.className = "file-row";
      row.innerHTML = `
        <div class="name" title="${file.name}">${file.name}</div>
        <div class="meta">${formatBytes(file.size)}</div>
        <button type="button" class="btn btn-ghost" data-remove="${idx}" aria-label="Remove">✕</button>
      `;
      fileList.appendChild(row);
    });
    convertBtn.disabled = false;
  }

  function addFiles(fileListLike) {
    const incoming = [...fileListLike].filter((f) =>
      /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name)
    );
    if (!incoming.length) {
      showAlert("Please select image files (PNG, JPG, WEBP, BMP, GIF).");
      return;
    }
    const keys = new Set(state.files.map((f) => f.name + f.size));
    for (const f of incoming) {
      const key = f.name + f.size;
      if (!keys.has(key)) {
        state.files.push(f);
        keys.add(key);
      }
    }
    clearAlert();
    renderFiles();
  }

  function setLoading(btn, loading, label) {
    if (loading) {
      btn.disabled = true;
      btn.dataset.label = btn.innerHTML;
      btn.innerHTML = `<span class="spinner"></span>${label || "Working…"}`;
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.label || btn.innerHTML;
    }
  }

  function setBusyUi(busy) {
    formatSelect.disabled = busy;
    dropzone.style.pointerEvents = busy ? "none" : "";
    dropzone.style.opacity = busy ? "0.6" : "";
    fileList.querySelectorAll("button").forEach((b) => {
      b.disabled = busy;
    });
  }

  function clearConverted() {
    state.converted = [];
  }

  function resetDownloadUi() {
    const btn = $("#btn-download");
    const note = $("#download-note");
    btn.disabled = false;
    btn.dataset.label = "Download ZIP";
    btn.innerHTML = "Download ZIP";
    note.className = "alert alert-success";
    note.textContent =
      "Download a ZIP from browser memory. Nothing was stored on a server.";
  }

  function updatePreview() {
    const pattern = patternInput.value.trim();
    if (!pattern || !state.converted.length) {
      previewBox.innerHTML = `<code class="hint">Enter a pattern ending with digits</code>`;
      $("#btn-apply-rename").disabled = true;
      return;
    }
    try {
      const ext = state.converted[0].name.includes(".")
        ? state.converted[0].name.slice(state.converted[0].name.lastIndexOf("."))
        : `.${state.targetFormat}`;
      const names = previewNames(pattern, state.converted.length, ext);
      previewBox.innerHTML = names
        .slice(0, 12)
        .map((n) => `<code>${n}</code>`)
        .join("");
      if (names.length > 12) {
        previewBox.innerHTML += `<code class="hint">…and ${names.length - 12} more</code>`;
      }
      $("#btn-apply-rename").disabled = false;
      clearAlert();
    } catch (err) {
      previewBox.innerHTML = `<code class="hint">${err.message}</code>`;
      $("#btn-apply-rename").disabled = true;
    }
  }

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", () => {
    addFiles(fileInput.files);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });
  dropzone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

  fileList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    state.files.splice(Number(btn.dataset.remove), 1);
    renderFiles();
  });

  convertBtn.addEventListener("click", async () => {
    if (!state.files.length) return;
    clearAlert();
    clearConverted();

    const total = state.files.length;
    const format = formatSelect.value;
    const startedAt = performance.now();
    const errors = [];

    setLoading(convertBtn, true, "Converting…");
    setBusyUi(true);
    showProgress(true);
    setProgress(0, total, null, startedAt);

    try {
      for (let i = 0; i < state.files.length; i++) {
        const file = state.files[i];
        setProgress(i, total, file.name, startedAt);
        // Yield so the progress UI can paint
        await new Promise((r) => requestAnimationFrame(() => r()));
        try {
          const item = await convertOne(file, format);
          state.converted.push(item);
        } catch (err) {
          errors.push(`${file.name}: ${err.message || "failed"}`);
        }
        setProgress(i + 1, total, file.name, startedAt);
      }

      if (!state.converted.length) {
        throw new Error(errors[0] || "No images could be converted");
      }

      state.targetFormat = format;
      convertSummary.innerHTML = `
        Converted <strong>${state.converted.length}</strong> image(s) to
        <strong>${format.toUpperCase()}</strong>
        in ${formatDuration(performance.now() - startedAt)}
        (browser memory only).
      `;
      if (errors.length) showAlert(errors.join(" · "), "info");
      showProgress(false);
      setStep(2);
    } catch (err) {
      showProgress(false);
      clearConverted();
      showAlert(err.message || "Conversion failed");
    } finally {
      setLoading(convertBtn, false);
      setBusyUi(false);
      convertBtn.disabled = !state.files.length;
    }
  });

  $("#btn-skip-rename").addEventListener("click", () => {
    setStep(4);
    $("#done-title").textContent = "Ready to download";
    $("#done-message").textContent =
      "Your converted images are ready in memory. Download them as a ZIP.";
    resetDownloadUi();
  });

  $("#btn-want-rename").addEventListener("click", () => {
    patternInput.value = "001";
    updatePreview();
    setStep(3);
  });

  let previewTimer = null;
  patternInput.addEventListener("input", () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 150);
  });

  $("#btn-apply-rename").addEventListener("click", () => {
    try {
      const pattern = patternInput.value.trim();
      const ext = state.converted[0].name.includes(".")
        ? state.converted[0].name.slice(state.converted[0].name.lastIndexOf("."))
        : `.${state.targetFormat}`;
      const names = previewNames(pattern, state.converted.length, ext);
      state.converted = state.converted.map((item, i) => ({
        ...item,
        name: names[i],
      }));
      setStep(4);
      $("#done-title").textContent = "Renamed & ready";
      $("#done-message").textContent = `Renamed ${state.converted.length} file(s) in memory. Download the ZIP below.`;
      resetDownloadUi();
    } catch (err) {
      showAlert(err.message || "Rename failed");
    }
  });

  $("#btn-back-convert").addEventListener("click", () => setStep(2));

  $("#btn-download").addEventListener("click", async () => {
    if (!state.converted.length) return;
    if (typeof JSZip === "undefined") {
      showAlert("JSZip failed to load. Check your network and refresh.");
      return;
    }

    const btn = $("#btn-download");
    const note = $("#download-note");
    setLoading(btn, true, "Building ZIP…");
    clearAlert();

    try {
      const zip = new JSZip();
      for (const item of state.converted) {
        zip.file(item.name, item.blob);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `images_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      clearConverted();
      state.files = [];
      renderFiles();

      $("#done-title").textContent = "Downloaded";
      $("#done-message").textContent =
        "ZIP saved to your Downloads. Browser memory for those images was cleared.";
      note.className = "alert alert-success";
      note.textContent =
        "Only the downloaded ZIP remains. Converted images were removed from memory.";
      btn.disabled = true;
      btn.textContent = "Downloaded";
    } catch (err) {
      showAlert(err.message || "Download failed");
      setLoading(btn, false);
    }
  });

  $("#btn-start-over").addEventListener("click", () => {
    clearConverted();
    state.files = [];
    showProgress(false);
    renderFiles();
    resetDownloadUi();
    setStep(1);
  });

  setStep(1);
  renderFiles();
})();
