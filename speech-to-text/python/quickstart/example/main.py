import json
import os
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext

def load_environment() -> None:
    try:
        from dotenv import load_dotenv
    except ModuleNotFoundError:
        return

    load_dotenv()

def transcribe_audio(audio_path: str) -> str:
    try:
        from elevenlabs import ElevenLabs
    except ModuleNotFoundError as import_error:
        raise RuntimeError(
            f"Missing Python package: {import_error.name}. Install dependencies with 'python -m pip install -r requirements.txt' inside your virtual environment."
        ) from import_error

    elevenlabs_client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])

    with open(audio_path, "rb") as audio_file:
        result = elevenlabs_client.speech_to_text.convert(
            file=audio_file,
            model_id="scribe_v2",
        )

    return result.text


def summarize_with_grok(transcript: str) -> str:
    try:
        from openai import OpenAI
    except ModuleNotFoundError as import_error:
        raise RuntimeError(
            f"Missing Python package: {import_error.name}. Install dependencies with 'python -m pip install -r requirements.txt' inside your virtual environment."
        ) from import_error

    grok_api_key = os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY")
    grok_model = os.environ.get("GROK_MODEL", "grok-2-latest")

    if not grok_api_key:
        return json.dumps(
            {
                "summary": "",
                "bullets": [],
                "actionItems": [],
                "error": "Grok API key is not configured.",
            },
            indent=2,
            ensure_ascii=False,
        )

    grok_client = OpenAI(api_key=grok_api_key, base_url="https://api.x.ai/v1")
    prompt = (
        "Summarize the following transcript and return ONLY valid JSON with these keys:\n"
        '{"summary": string, "bullets": string[], "actionItems": string[]}\n\n'
        "Rules:\n"
        "- Do not invent facts.\n"
        "- Preserve names, dates, and technical terms exactly.\n"
        "- Keep the summary concise.\n\n"
        f"Transcript:\n{transcript}"
    )

    resp = grok_client.chat.completions.create(
        model=grok_model,
        messages=[
            {"role": "system", "content": "You summarize speech transcripts accurately and concisely."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=400,
        temperature=0.2,
    )
    summary_text = resp.choices[0].message.content.strip()

    try:
        summary_json = json.loads(summary_text)
    except json.JSONDecodeError:
        summary_json = {"summary": summary_text, "bullets": [], "actionItems": []}

    return json.dumps(summary_json, indent=2, ensure_ascii=False)


class TranscriptApp:
    def __init__(self, default_audio_path: str = "./audio.mp3") -> None:
        self.root = tk.Tk()
        self.root.title("Speech-to-Text Summary")
        self.root.geometry("980x760")

        self.audio_path_var = tk.StringVar(value=default_audio_path)
        self.status_var = tk.StringVar(value="Choose an audio file and click Transcribe.")
        self.transcript_text = ""
        self.summary_text = ""

        self.transcript_frame = tk.Frame(self.root)
        self.summary_frame = tk.Frame(self.root)

        self._build_transcript_page()
        self._build_summary_page()
        self._show_transcript_page()

    def _build_transcript_page(self) -> None:
        outer = self.transcript_frame
        outer.pack(fill="both", expand=True)
        outer.configure(padx=16, pady=16)

        header = tk.Label(outer, text="Speech-to-Text Summary", font=("Segoe UI", 18, "bold"))
        header.pack(anchor="w")

        subtitle = tk.Label(
            outer,
            text="Transcribe audio with ElevenLabs Scribe v2 and summarize it with Grok.",
            font=("Segoe UI", 10),
            fg="#555555",
        )
        subtitle.pack(anchor="w", pady=(4, 16))

        file_row = tk.Frame(outer)
        file_row.pack(fill="x", pady=(0, 12))

        tk.Label(file_row, text="Audio file:", width=10, anchor="w").pack(side="left")
        entry = tk.Entry(file_row, textvariable=self.audio_path_var)
        entry.pack(side="left", fill="x", expand=True, padx=(0, 8))

        browse_button = tk.Button(file_row, text="Browse", command=self._browse_file)
        browse_button.pack(side="left")

        action_row = tk.Frame(outer)
        action_row.pack(fill="x", pady=(0, 8))

        self.transcribe_button = tk.Button(action_row, text="Transcribe + Summarize", command=self._start_processing)
        self.transcribe_button.pack(side="left")

        status_label = tk.Label(action_row, textvariable=self.status_var, anchor="w", fg="#555555")
        status_label.pack(side="left", padx=(12, 0))

        transcript_label = tk.Label(outer, text="Transcript", font=("Segoe UI", 11, "bold"))
        transcript_label.pack(anchor="w", pady=(12, 6))

        self.transcript_box = scrolledtext.ScrolledText(outer, height=12, wrap="word")
        self.transcript_box.pack(fill="both", expand=True)
        self.transcript_box.config(state="disabled")

        self.summary_button_container = tk.Frame(outer)
        self.summary_button_container.pack(fill="x", pady=(14, 0))
        self.summary_button = tk.Button(
            self.summary_button_container,
            text="Open Summary Page",
            command=self._show_summary_page,
        )
        self.summary_button.pack(side="right")
        self.summary_button.pack_forget()

    def _build_summary_page(self) -> None:
        outer = self.summary_frame
        outer.configure(padx=16, pady=16)

        header = tk.Label(outer, text="Grok Summary", font=("Segoe UI", 18, "bold"))
        header.pack(anchor="w")

        subtitle = tk.Label(
            outer,
            text="Structured JSON summary generated from the transcript.",
            font=("Segoe UI", 10),
            fg="#555555",
        )
        subtitle.pack(anchor="w", pady=(4, 16))

        self.summary_box = scrolledtext.ScrolledText(outer, height=24, wrap="word")
        self.summary_box.pack(fill="both", expand=True)
        self.summary_box.config(state="disabled")

        button_row = tk.Frame(outer)
        button_row.pack(fill="x", pady=(14, 0))

        back_button = tk.Button(button_row, text="Back to Transcript", command=self._show_transcript_page)
        back_button.pack(side="left")

    def _show_transcript_page(self) -> None:
        self.summary_frame.pack_forget()
        self.transcript_frame.pack(fill="both", expand=True)

    def _show_summary_page(self) -> None:
        self.transcript_frame.pack_forget()
        self.summary_frame.pack(fill="both", expand=True)

    def _browse_file(self) -> None:
        file_path = filedialog.askopenfilename(
            title="Select audio file",
            filetypes=[("Audio files", "*.mp3 *.wav *.m4a *.mp4 *.aac *.flac"), ("All files", "*.*")],
        )
        if file_path:
            self.audio_path_var.set(file_path)

    def _set_text(self, widget: scrolledtext.ScrolledText, text: str) -> None:
        widget.config(state="normal")
        widget.delete("1.0", tk.END)
        widget.insert(tk.END, text)
        widget.config(state="disabled")

    def _start_processing(self) -> None:
        audio_path = self.audio_path_var.get().strip()
        if not audio_path:
            messagebox.showerror("Missing file", "Please choose an audio file first.")
            return

        self.transcribe_button.config(state="disabled")
        self.summary_button.pack_forget()
        self.status_var.set("Transcribing and summarizing...")
        self._set_text(self.transcript_box, "")
        self._set_text(self.summary_box, "")

        worker = threading.Thread(target=self._process_audio, args=(audio_path,), daemon=True)
        worker.start()

    def _process_audio(self, audio_path: str) -> None:
        try:
            transcript = transcribe_audio(audio_path)
            summary_json = summarize_with_grok(transcript)
        except FileNotFoundError:
            self.root.after(0, lambda: messagebox.showerror("File not found", f"Audio file not found: {audio_path}"))
            self.root.after(0, self._reset_ui)
            return
        except Exception as exc:
            self.root.after(0, lambda: messagebox.showerror("Processing failed", str(exc)))
            self.root.after(0, self._reset_ui)
            return

        self.transcript_text = transcript
        self.summary_text = summary_json

        self.root.after(0, lambda: self._set_text(self.transcript_box, transcript))
        self.root.after(0, lambda: self._set_text(self.summary_box, summary_json))
        self.root.after(0, lambda: self.status_var.set("Done. Open the summary page below."))
        self.root.after(0, self._show_summary_button)
        self.root.after(0, self._reset_button)

    def _reset_button(self) -> None:
        self.transcribe_button.config(state="normal")

    def _show_summary_button(self) -> None:
        self.summary_button.pack(side="right")

    def _reset_ui(self) -> None:
        self.transcribe_button.config(state="normal")
        self.status_var.set("Choose an audio file and click Transcribe.")
        self.summary_button.pack_forget()

    def run(self) -> None:
        self.root.mainloop()


def main() -> None:
    load_environment()
    default_audio_path = sys.argv[1] if len(sys.argv) > 1 else "./audio.mp3"
    app = TranscriptApp(default_audio_path=default_audio_path)
    app.run()

if __name__ == "__main__":
    main()
