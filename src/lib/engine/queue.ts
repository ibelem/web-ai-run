import type { Backend, TestItem } from './types';

interface QueueModel {
  hf_model_id: string;
  file_path: string;
  data_type: string;
  runtime: 'onnx' | 'litert';
}

export function buildTestQueue(models: QueueModel[], backends: Backend[]): TestItem[] {
  const queue: TestItem[] = [];

  for (const model of models) {
    for (const backend of backends) {
      queue.push({
        id: `${model.hf_model_id}::${model.file_path}::${backend}::${crypto.randomUUID()}`,
        hf_model_id: model.hf_model_id,
        file_path: model.file_path,
        data_type: model.data_type,
        runtime: model.runtime,
        backend,
        status: 'pending',
        progress: 0,
      });
    }
  }

  return queue;
}
