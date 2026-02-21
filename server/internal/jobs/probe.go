package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"os/exec"
	"strconv"
)

type ffprobeOutput struct {
	Streams []struct {
		CodecType string `json:"codec_type"`
	} `json:"streams"`
	Format struct {
		Duration string `json:"duration"`
	} `json:"format"`
}

func probeMedia(ctx context.Context, filePath string) (float64, bool, error) {
	cmd := exec.CommandContext(
		ctx,
		"ffprobe",
		"-v", "error",
		"-show_streams",
		"-show_format",
		"-of", "json",
		filePath,
	)
	out, err := cmd.Output()
	if err != nil {
		return 0, false, err
	}

	var parsed ffprobeOutput
	if err := json.Unmarshal(out, &parsed); err != nil {
		return 0, false, err
	}

	durationSec, err := strconv.ParseFloat(parsed.Format.Duration, 64)
	if err != nil {
		return 0, false, errors.New("could not parse media duration")
	}

	hasAudio := false
	for _, stream := range parsed.Streams {
		if stream.CodecType == "audio" {
			hasAudio = true
			break
		}
	}
	return durationSec, hasAudio, nil
}
