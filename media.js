// =========================================================
// CLIENT-SIDE PHOTO & VIDEO COMPRESSOR + AUTO-DELETE ENGINE
// =========================================================

const MediaEngine = {
  // 1. Compress Profile DP (Tiny 150x150 JPEG < 25KB)
  compressAvatar(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const size = 150;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");

          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

          resolve(canvas.toDataURL("image/jpeg", 0.65));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // 2. Compress Chat Photo (Max 720px width, ~60-90KB)
  compressChatImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 720;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);

          resolve(canvas.toDataURL("image/jpeg", 0.6));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // 3. Compress Video Client-Side (Downscales to 360p low-bitrate WebM/MP4)
  async compressChatVideo(file, appConfig) {
    if (appConfig && appConfig.cloudName && appConfig.cloudPreset) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", appConfig.cloudPreset);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${appConfig.cloudName}/video/upload`,
        { method: "POST", body: formData }
      );
      if (res.ok) {
        const json = await res.json();
        return { url: json.secure_url, isExternal: true };
      }
    }

    return new Promise((resolve, reject) => {
      const videoUrl = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.src = videoUrl;
      video.muted = true;
      video.playsInline = true;

      video.onloadedmetadata = () => {
        const duration = Math.min(video.duration || 10, 12);
        const scale = Math.min(1, 360 / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.max(160, Math.round(video.videoWidth * scale));
        const h = Math.max(160, Math.round(video.videoHeight * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");

        const stream = canvas.captureStream(15);
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
          ? "video/webm;codecs=vp8"
          : "video/webm";

        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 280000
        });

        const chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          URL.revokeObjectURL(videoUrl);
          const blob = new Blob(chunks, { type: mimeType });
          if (blob.size > 1.8 * 1024 * 1024) {
            reject(new Error("Video too long even after compression. Send a shorter clip (<10s)."));
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => resolve({ url: reader.result, isExternal: false });
          reader.readAsDataURL(blob);
        };

        video.play().then(() => {
          recorder.start();
          const drawFrame = () => {
            if (video.paused || video.ended || video.currentTime >= duration) {
              if (recorder.state === "recording") recorder.stop();
              video.pause();
              return;
            }
            ctx.drawImage(video, 0, 0, w, h);
            requestAnimationFrame(drawFrame);
          };
          drawFrame();
        }).catch(reject);
      };

      video.onerror = () => reject(new Error("Unsupported video format on this device."));
    });
  }
};
