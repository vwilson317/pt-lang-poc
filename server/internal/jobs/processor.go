package jobs

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"
)

type Processor struct{}

func NewProcessor() *Processor {
	return &Processor{}
}

func (p *Processor) Process(ctx context.Context, jobID string, filePath string) (Status, string, *ClipResult) {
	defer os.Remove(filePath) // No video retention.

	durationSec, hasAudio, err := probeMedia(ctx, filePath)
	if err != nil {
		return StatusFailedTranscode, "ffprobe failed, media could not be validated", nil
	}

	if durationSec > 45 {
		return StatusFailedTooLong, "clip exceeds 45 second limit", nil
	}
	if !hasAudio {
		return StatusFailedNoAudio, "no usable audio stream detected", nil
	}

	// v1.1: mocked transcript mining pipeline result.
	// Swap this section with Whisper + translation integration in v1.2.
	original := "Oi, tudo bem? Eu estou aprendendo portugues. Vamos praticar agora."
	translated := "Hi, how are you? I am learning Portuguese. Let's practice now."
	result := &ClipResult{
		ID:                   jobID,
		SourceLanguage:       "pt",
		TargetLanguage:       "en",
		TranscriptOriginal:   original,
		TranscriptTranslated: translated,
		CreatedAt:            time.Now().UnixMilli(),
		Segments: []Segment{
			{
				ID:             "seg-1",
				StartMs:        0,
				EndMs:          3000,
				TextOriginal:   "Oi, tudo bem?",
				TextTranslated: "Hi, how are you?",
				Tokens: []Token{
					{Text: "Oi", Translation: "Hi"},
					{Text: "tudo", Translation: "all"},
					{Text: "bem", Translation: "well"},
				},
			},
			{
				ID:             "seg-2",
				StartMs:        3000,
				EndMs:          7000,
				TextOriginal:   "Eu estou aprendendo portugues.",
				TextTranslated: "I am learning Portuguese.",
				Tokens: []Token{
					{Text: "aprendendo", WordType: "verb", Translation: "learning"},
					{Text: "portugues", WordType: "noun", Translation: "Portuguese"},
				},
			},
			{
				ID:             "seg-3",
				StartMs:        7000,
				EndMs:          10000,
				TextOriginal:   "Vamos praticar agora.",
				TextTranslated: "Let's practice now.",
				Tokens: []Token{
					{Text: "Vamos", WordType: "verb", Translation: "let's go"},
					{Text: "praticar", WordType: "verb", Translation: "practice"},
					{Text: "agora", WordType: "adverb", Translation: "now"},
				},
			},
		},
	}
	result.TranscriptOriginal = strings.TrimSpace(result.TranscriptOriginal)
	result.TranscriptTranslated = strings.TrimSpace(result.TranscriptTranslated)
	if result.TranscriptOriginal == "" || result.TranscriptTranslated == "" {
		return StatusFailedTranscribe, fmt.Sprintf("empty transcript for job %s", jobID), nil
	}
	return StatusDone, "", result
}
