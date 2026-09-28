import { useCallback, useEffect, useRef, useState } from "react";
import { aiApi } from "./api.js";

function bestMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported?.(type)) ?? "";
}

export function useVoiceRecorder({ onTranscript } = {}) {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const discardRef = useRef(false);
  const mountedRef = useRef(true);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (["requesting", "recording", "transcribing"].includes(status)) return;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      const unsupported = new Error("当前浏览器不支持录音，请使用桌面版或新版 Chromium");
      unsupported.code = "VOICE_RECORDING_UNSUPPORTED";
      setError(unsupported);
      setStatus("error");
      return;
    }
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      const mimeType = bestMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      discardRef.current = false;
      recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunksRef.current.push(event.data); });
      recorder.addEventListener("stop", async () => {
        stopTracks();
        if (discardRef.current || !mountedRef.current) { setStatus("idle"); return; }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) {
          const empty = new Error("这次没有录到声音，请重试");
          empty.code = "VOICE_FILE_EMPTY";
          setError(empty);
          setStatus("error");
          return;
        }
        setStatus("transcribing");
        try {
          const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
          const result = await aiApi.transcribe(new File([blob], `idea-${Date.now()}.${extension}`, { type: blob.type }));
          if (!mountedRef.current) return;
          onTranscript?.(result);
          setStatus("done");
        } catch (transcriptionError) {
          if (!mountedRef.current) return;
          setError(transcriptionError);
          setStatus("error");
        }
      });
      recorder.start(250);
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setStatus("recording");
    } catch (recordingError) {
      stopTracks();
      const errorToShow = recordingError instanceof Error ? recordingError : new Error("麦克风启动失败");
      if (errorToShow.name === "NotAllowedError") errorToShow.message = "麦克风权限未开启，请允许后重试";
      setError(errorToShow);
      setStatus("error");
    }
  }, [onTranscript, status, stopTracks]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    discardRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    stopTracks();
    setStatus("idle");
    setError(null);
  }, [stopTracks]);

  useEffect(() => {
    if (status !== "recording") return undefined;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1_000);
      setElapsedSeconds(elapsed);
      if (elapsed >= 120) stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [status, stop]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      discardRef.current = true;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      stopTracks();
    };
  }, [stopTracks]);

  return { status, error, elapsedSeconds, start, stop, cancel, recording: status === "recording", busy: ["requesting", "recording", "transcribing"].includes(status) };
}
