import type { ClipRecord, ClipStatus } from '../types/v11';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

export type JobStatusResponse = {
  jobId: string;
  status: ClipStatus | 'PROCESSING';
  message?: string;
  createdAt: number;
};

type UploadFile = {
  uri: string;
  name: string;
  mimeType?: string;
};

type CreateJobResponse = {
  jobId: string;
};

export async function createJob(
  file: UploadFile,
  onProgress?: (pct: number) => void
): Promise<CreateJobResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/jobs`);
    xhr.responseType = 'json';

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      onProgress?.(Math.round((evt.loaded / evt.total) * 100));
    };

    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.onload = () => {
      const status = xhr.status;
      if (status < 200 || status >= 300) {
        reject(new Error(`Upload failed (${status})`));
        return;
      }
      resolve(xhr.response as CreateJobResponse);
    };

    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType ?? 'video/mp4',
    } as unknown as Blob);
    xhr.send(formData);
  });
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const res = await fetch(`${API_BASE_URL}/jobs/${jobId}`);
  if (!res.ok) {
    throw new Error(`Status check failed (${res.status})`);
  }
  return (await res.json()) as JobStatusResponse;
}

export async function getJobResult(jobId: string): Promise<ClipRecord> {
  const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/result`);
  if (!res.ok) {
    throw new Error(`Result fetch failed (${res.status})`);
  }
  return (await res.json()) as ClipRecord;
}
