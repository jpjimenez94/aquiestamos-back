import { Router } from 'express'
import { MeetingTelemetryController } from '../controllers/meetingTelemetry.controller.js'

export const meetingTelemetryRoutes = Router()

meetingTelemetryRoutes.get('/live', MeetingTelemetryController.live)
meetingTelemetryRoutes.get('/:id/info', MeetingTelemetryController.info)
meetingTelemetryRoutes.post('/:id/join', MeetingTelemetryController.join)
meetingTelemetryRoutes.post('/logs/:logId/ping', MeetingTelemetryController.ping)
meetingTelemetryRoutes.post('/:id/leave', MeetingTelemetryController.leave)
meetingTelemetryRoutes.post('/:id/report-error', MeetingTelemetryController.reportError)
