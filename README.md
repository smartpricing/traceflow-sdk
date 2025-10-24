# TraceFlow SDK

SDK TypeScript per inviare messaggi di tracking dei job su Kafka. Fornisce un'interfaccia semplice per creare, aggiornare e completare job con gestione automatica degli step e logging.

## 🌟 Caratteristiche

- ✅ **Gestione Job Completa** - Crea, aggiorna, completa o fallisci job
- ✅ **Auto-incremento Step** - Gli step vengono numerati automaticamente se non specificato
- ✅ **Logging Integrato** - Helper per log a livello INFO, WARN, ERROR, DEBUG
- ✅ **TypeScript First** - Completamente tipizzato con TypeScript
- ✅ **Kafka Flessibile** - Usa configurazione o istanza Kafka esistente
- ✅ **Job Manager** - Gestione intuitiva di job e step tramite oggetto dedicato
- ✅ **Metadata Ricchi** - Supporto per tags, metadata personalizzati, params e results

## 📦 Installazione

```bash
npm install traceflow-sdk
# oppure
yarn add traceflow-sdk
```

## 🚀 Quick Start

### Esempio Base

```typescript
import { TraceFlowClient, JobStatus } from 'traceflow-sdk';

// Crea il client
const client = new TraceFlowClient(
  {
    brokers: ['localhost:9092'],
    topic: 'ota-jobs',
    clientId: 'my-app',
  },
  'my-service' // source di default
);

// Connetti a Kafka
await client.connect();

// Crea un job
const job = await client.createJob({
  job_type: 'sync',
  title: 'Sync Airbnb Data',
  description: 'Synchronizing booking data',
  tags: ['airbnb', 'sync'],
  params: { start_date: '2024-01-01' },
});

// Aggiorna lo status a running
await job.updateJob({ status: JobStatus.RUNNING });

// Crea step (con auto-incremento!)
const step1 = await job.createStep({
  name: 'Fetch Data',
  step_type: 'fetch',
});

// Aggiungi log
await job.info('Fetching data from API...', undefined, step1);

// Completa lo step
await job.completeStep(step1, { records_fetched: 100 });

// Crea altro step (sarà automaticamente step_number: 1)
const step2 = await job.createStep({
  name: 'Transform Data',
  step_type: 'transform',
});

await job.completeStep(step2, { records_transformed: 100 });

// Completa il job
await job.completeJob({ total_records: 100, success: true });

// Disconnetti
await client.disconnect();
```

## 📖 Utilizzo

### 1. Creare il Client

#### Con Configurazione Kafka

```typescript
const client = new TraceFlowClient(
  {
    brokers: ['localhost:9092'],
    topic: 'ota-jobs',
    clientId: 'my-app',
  },
  'my-service' // optional: source di default
);

await client.connect();
```

#### Con Istanza Kafka Esistente

Utile quando hai già un'istanza Kafka nella tua applicazione:

```typescript
import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'my-app',
  brokers: ['localhost:9092'],
});

const producer = kafka.producer();
await producer.connect();

// Riusa il producer esistente
const client = new TraceFlowClient(
  {
    topic: 'ota-jobs',
    producer: producer, // Usa il producer esistente
  },
  'my-service'
);

// Non serve chiamare connect() - il producer è già connesso
```

Oppure passa l'istanza Kafka:

```typescript
const client = new TraceFlowClient(
  {
    topic: 'ota-jobs',
    kafka: kafka, // Passa l'istanza Kafka
  },
  'my-service'
);

await client.connect();
```

### 2. Creare un Job

```typescript
const job = await client.createJob({
  job_type: 'sync', // tipo di job
  title: 'Sync Booking Data',
  description: 'Synchronizing bookings from Airbnb',
  owner: 'sync-service',
  tags: ['airbnb', 'booking', 'urgent'],
  metadata: {
    property_id: '12345',
    connection_id: 'conn-abc',
  },
  params: {
    start_date: '2024-01-01',
    end_date: '2024-01-31',
  },
});

console.log(`Job ID: ${job.getJobId()}`);
```

### 3. Aggiornare un Job

```typescript
// Aggiorna status
await job.updateJob({ status: JobStatus.RUNNING });

// Aggiorna con più campi
await job.updateJob({
  status: JobStatus.RUNNING,
  metadata: { progress: '50%' },
});
```

### 4. Gestire gli Step

#### Auto-incremento (Consigliato)

Gli step vengono numerati automaticamente partendo da 0:

```typescript
// Step 0
const step1 = await job.createStep({
  name: 'Fetch Data',
  step_type: 'fetch',
  input: { endpoint: '/api/bookings' },
});

// Step 1 (auto-incrementato!)
const step2 = await job.createStep({
  name: 'Transform Data',
  step_type: 'transform',
});

// Step 2 (auto-incrementato!)
const step3 = await job.createStep({
  name: 'Save Data',
  step_type: 'save',
});
```

#### Numerazione Manuale

Puoi anche specificare manualmente i numeri degli step:

```typescript
const step = await job.createStep({
  step_number: 10, // Numero esplicito
  name: 'Special Step',
  step_type: 'process',
});

// Il prossimo step auto-incrementato sarà 11
const nextStep = await job.createStep({
  name: 'Next Step',
}); // step_number: 11
```

#### Completare e Aggiornare Step

```typescript
// Completa con successo
await job.completeStep(step1, {
  records_processed: 150,
  duration_ms: 1234,
});

// Fallisci uno step
await job.failStep(step2, 'Connection timeout');

// Aggiorna uno step
await job.updateStep(step1, {
  status: StepStatus.IN_PROGRESS,
  metadata: { progress: '75%' },
});
```

### 5. Logging

#### Log Generici

```typescript
await job.log({
  level: LogLevel.INFO,
  event_type: EventType.MESSAGE,
  message: 'Processing started',
  details: { batch_size: 100 },
  step_number: step1, // opzionale: collega a uno step
});
```

#### Helper per Logging

```typescript
// Log a livello di job
await job.info('Job started successfully');
await job.warn('API response slow', { response_time: 3500 });
await job.error('Connection failed', { error_code: 'CONN_ERR' });
await job.debug('Debug info', { state: 'processing' });

// Log collegato a uno step
await job.info('Fetching data...', undefined, step1);
await job.warn('Partial data received', { expected: 100, received: 80 }, step1);
await job.error('Step failed', { reason: 'timeout' }, step1);
```

### 6. Completare o Fallire un Job

```typescript
// Successo
await job.completeJob({
  total_records: 150,
  sync_duration_ms: 5000,
  success: true,
});

// Fallimento
await job.failJob('Sync failed: connection timeout');

// Cancellare
await job.cancelJob();
```

### 7. Recuperare un Job Esistente

Utile per aggiornare un job da un altro processo o istanza:

```typescript
const existingJob = client.getJobManager('existing-job-uuid');

// Ora puoi aggiornare il job
await existingJob.updateJob({ status: JobStatus.RUNNING });
await existingJob.completeJob({ success: true });
```

## 📝 Esempi Completi

### Esempio 1: Sync con Retry Logic

```typescript
const job = await client.createJob({
  job_type: 'sync',
  title: 'Sync with Retry',
  metadata: { max_retries: '3' },
});

await job.updateJob({ status: JobStatus.RUNNING });

const step = await job.createStep({
  name: 'Fetch API',
  step_type: 'fetch',
});

let attempt = 0;
const maxRetries = 3;

for (attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    await job.info(`Attempt ${attempt} of ${maxRetries}`, { attempt }, step);

    // Tuo codice qui...
    const data = await fetchExternalAPI();

    await job.completeStep(step, { success: true, attempts: attempt });
    break;
  } catch (error: any) {
    await job.warn(`Attempt ${attempt} failed`, { attempt, error: error.message }, step);

    if (attempt === maxRetries) {
      await job.failStep(step, 'Max retries exceeded');
      await job.failJob('Sync failed after all retries');
      return;
    }

    const delay = Math.pow(2, attempt) * 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

await job.completeJob({ success: true });
```

### Esempio 2: Workflow Complesso

```typescript
const job = await client.createJob({
  job_type: 'import',
  title: 'Complex Data Import',
});

await job.updateJob({ status: JobStatus.RUNNING });

// Fase 1: Download
const downloadStep = await job.createStep({
  name: 'Download CSV',
  step_type: 'download',
});

await job.info('Starting download...', undefined, downloadStep);
const fileData = await downloadFile();
await job.completeStep(downloadStep, { file_size: fileData.size });

// Fase 2: Validazione
const validateStep = await job.createStep({
  name: 'Validate Data',
  step_type: 'validation',
});

const validation = await validateData(fileData);
if (!validation.valid) {
  await job.error('Validation failed', validation.errors, validateStep);
  await job.failStep(validateStep, 'Invalid data format');
  await job.failJob('Import aborted due to validation errors');
  return;
}

await job.completeStep(validateStep, { records_validated: validation.count });

// Fase 3: Import
const importStep = await job.createStep({
  name: 'Import to Database',
  step_type: 'import',
});

let imported = 0;
for (const batch of validation.batches) {
  await importBatch(batch);
  imported += batch.length;
  await job.info(`Imported ${imported} records`, { imported, total: validation.count }, importStep);
}

await job.completeStep(importStep, { imported });

// Completa
await job.completeJob({
  total_imported: imported,
  file_size: fileData.size,
  duration_ms: Date.now() - startTime,
});
```

## 🔧 API Reference

### TraceFlowClient

#### Constructor

```typescript
new TraceFlowClient(config: TraceFlowConfig, defaultSource?: string)
```

#### Metodi

- `connect(): Promise<void>` - Connetti a Kafka
- `disconnect(): Promise<void>` - Disconnetti da Kafka
- `createJob(options: CreateJobOptions): Promise<JobManager>` - Crea un nuovo job
- `getJobManager(jobId: string, source?: string): JobManager` - Ottieni manager per job esistente
- `isConnected(): boolean` - Verifica se connesso
- `getTopic(): string` - Ottieni il topic configurato
- `getDefaultSource(): string | undefined` - Ottieni la source di default

### JobManager

#### Metodi Job

- `getJobId(): string` - Ottieni job ID
- `updateJob(options: UpdateJobOptions): Promise<void>` - Aggiorna job
- `completeJob(result?: any): Promise<void>` - Completa job con successo
- `failJob(error: string): Promise<void>` - Fallisci job
- `cancelJob(): Promise<void>` - Cancella job

#### Metodi Step

- `createStep(options?: CreateStepOptions): Promise<number>` - Crea step (con auto-increment)
- `updateStep(stepNumber: number, options?: UpdateStepOptions): Promise<void>` - Aggiorna step
- `completeStep(stepNumber: number, output?: any): Promise<void>` - Completa step
- `failStep(stepNumber: number, error: string): Promise<void>` - Fallisci step

#### Metodi Log

- `log(options: CreateLogOptions): Promise<void>` - Crea log generico
- `info(message: string, details?: any, stepNumber?: number): Promise<void>` - Log INFO
- `warn(message: string, details?: any, stepNumber?: number): Promise<void>` - Log WARN
- `error(message: string, details?: any, stepNumber?: number): Promise<void>` - Log ERROR
- `debug(message: string, details?: any, stepNumber?: number): Promise<void>` - Log DEBUG

## 🎯 Best Practices

1. **Usa l'auto-incremento** per gli step quando possibile - è più semplice e meno error-prone
2. **Aggiungi logging dettagliato** - aiuta nel debugging e monitoring
3. **Usa metadata e tags** - facilita il filtering e l'analisi dei job
4. **Gestisci sempre gli errori** - usa `failJob()` e `failStep()` appropriatamente
5. **Riusa le connessioni Kafka** - passa istanze esistenti per migliori performance
6. **Chiudi le connessioni** - chiama sempre `disconnect()` quando finito

## 📊 Schema Messaggi Kafka

I messaggi inviati al topic Kafka hanno questo formato:

```json
{
  "type": "job" | "step" | "log",
  "data": {
    // ... campi specifici per tipo
  }
}
```

Vedi la documentazione del servizio `cb-channel-scylla-writter` per dettagli completi sullo schema.

## 🤝 Integrazione

Questo SDK è progettato per funzionare con:

- **cb-channel-scylla-writter** - Consumer Kafka che scrive su ScyllaDB
- **scylla-job-dashboard** - Dashboard Nuxt per visualizzare i job

## 📄 License

ISC

## 👨‍💻 Author

Andrei Borcea

