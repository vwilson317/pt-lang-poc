package jobs

import "time"

type Status string

const (
	StatusProcessing      Status = "PROCESSING"
	StatusDone            Status = "DONE"
	StatusFailedNoAudio   Status = "FAILED_NO_AUDIO"
	StatusFailedTooLong   Status = "FAILED_TOO_LONG"
	StatusFailedTranscode Status = "FAILED_TRANSCODE"
	StatusFailedTranscribe Status = "FAILED_TRANSCRIBE"
)

type Token struct {
	Text        string `json:"text"`
	WordType    string `json:"wordType,omitempty"`
	Translation string `json:"translation,omitempty"`
}

type Segment struct {
	ID             string  `json:"id"`
	StartMs        int64   `json:"startMs"`
	EndMs          int64   `json:"endMs"`
	TextOriginal   string  `json:"textOriginal"`
	TextTranslated string  `json:"textTranslated"`
	Tokens         []Token `json:"tokens,omitempty"`
}

type ClipResult struct {
	ID                   string    `json:"id"`
	SourceLanguage       string    `json:"sourceLanguage"`
	TargetLanguage       string    `json:"targetLanguage"`
	TranscriptOriginal   string    `json:"transcriptOriginal"`
	TranscriptTranslated string    `json:"transcriptTranslated"`
	Segments             []Segment `json:"segments"`
	CreatedAt            int64     `json:"createdAt"`
}

type Job struct {
	ID        string
	Status    Status
	Message   string
	CreatedAt time.Time
	Result    *ClipResult
}
