import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MigrationPhase, MigrationRequest, TestConnectionResult } from '../../preload'

const terminalPhases: MigrationPhase[] = ['idle', 'done', 'error', 'cancelled']

export interface MigrationFormState {
  sourceUrl: string
  destinationAdminUrl: string
  targetDatabase: string
  dropExisting: boolean
}

export function useMigration(): {
  form: MigrationFormState
  phase: MigrationPhase
  running: boolean
  logs: string[]
  status: string
  testResult: TestConnectionResult | null
  updateForm: <Key extends keyof MigrationFormState>(
    key: Key,
    value: MigrationFormState[Key]
  ) => void
  dismissTestResult: () => void
  start: () => Promise<void>
  cancel: () => Promise<void>
  testSource: () => Promise<void>
  testDestination: () => Promise<void>
} {
  const [form, setForm] = useState<MigrationFormState>({
    sourceUrl: '',
    destinationAdminUrl: '',
    targetDatabase: '',
    dropExisting: false
  })
  const [phase, setPhase] = useState<MigrationPhase>('idle')
  const [logs, setLogs] = useState<string[]>([])
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)

  useEffect(() => {
    const unsubscribeLog = window.api.onLog((line) => {
      setLogs((current) => [...current, timestamp(line)])
    })
    const unsubscribePhase = window.api.onPhase(setPhase)

    return () => {
      unsubscribeLog()
      unsubscribePhase()
    }
  }, [])

  const running = useMemo(() => !terminalPhases.includes(phase), [phase])
  const status = readablePhase(phase)

  const updateForm = useCallback(
    <Key extends keyof MigrationFormState>(key: Key, value: MigrationFormState[Key]) => {
      setForm((current) => ({ ...current, [key]: value }))
    },
    []
  )

  const start = useCallback(async () => {
    const request: MigrationRequest = {
      sourceUrl: form.sourceUrl.trim(),
      destinationAdminUrl: form.destinationAdminUrl.trim(),
      targetDatabase: form.targetDatabase.trim() || undefined,
      dropExisting: form.dropExisting
    }

    setLogs([])
    setTestResult(null)

    try {
      await window.api.start(request)
    } catch (error) {
      setLogs((current) => [...current, timestamp(errorMessage(error))])
    }
  }, [form])

  const cancel = useCallback(async () => {
    await window.api.cancel()
  }, [])

  const dismissTestResult = useCallback(() => {
    setTestResult(null)
  }, [])

  const testSource = useCallback(async () => {
    setTestResult(await window.api.test(form.sourceUrl.trim()))
  }, [form.sourceUrl])

  const testDestination = useCallback(async () => {
    setTestResult(await window.api.test(form.destinationAdminUrl.trim()))
  }, [form.destinationAdminUrl])

  return {
    form,
    phase,
    running,
    logs,
    status,
    testResult,
    updateForm,
    dismissTestResult,
    start,
    cancel,
    testSource,
    testDestination
  }
}

function readablePhase(phase: MigrationPhase): string {
  switch (phase) {
    case 'idle':
      return 'Ready'
    case 'validating':
      return 'Validating connection details'
    case 'checking-tools':
      return 'Checking PostgreSQL client tools'
    case 'creating-database':
      return 'Preparing destination database'
    case 'dumping':
      return 'Dumping source database'
    case 'restoring':
      return 'Restoring into destination'
    case 'done':
      return 'Migration complete'
    case 'error':
      return 'Migration failed'
    case 'cancelled':
      return 'Migration cancelled'
  }
}

function timestamp(line: string): string {
  return `[${new Date().toLocaleTimeString()}] ${line}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error.'
}
