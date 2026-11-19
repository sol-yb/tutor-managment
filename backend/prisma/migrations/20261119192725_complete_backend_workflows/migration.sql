-- AlterTable
ALTER TABLE "HomeworkSubmission" ADD COLUMN     "studentId" TEXT;

-- CreateTable
CREATE TABLE "TutorApplicationHistory" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" "TutorApplicationStatus" NOT NULL,
    "reason" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorApplicationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonSeries" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "recurrenceRule" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TutorApplicationHistory_applicationId_createdAt_idx" ON "TutorApplicationHistory"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "LessonSeries_engagementId_startAt_idx" ON "LessonSeries"("engagementId", "startAt");

-- AddForeignKey
ALTER TABLE "TutorApplicationHistory" ADD CONSTRAINT "TutorApplicationHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "TutorApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSeries" ADD CONSTRAINT "LessonSeries_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "TutoringEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
