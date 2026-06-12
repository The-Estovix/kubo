from fastapi import APIRouter, HTTPException, Request

from app.schemas.weekly_reports import WeeklyReportDetailDto, WeeklyReportSummaryDto
from app.services.weekly_report_repository import WeeklyReportReadRepository
from app.services.weekly_report_service import WeeklyReportRetrievalService

router = APIRouter(prefix="/api/projects/{project_id}/weekly-reports", tags=["weekly-reports"])


@router.get("", response_model=list[WeeklyReportSummaryDto])
async def list_weekly_reports(project_id: str, request: Request) -> list[WeeklyReportSummaryDto]:
  service = WeeklyReportRetrievalService(WeeklyReportReadRepository(request))
  return await service.list_project_reports(project_id)


@router.get("/{report_id}", response_model=WeeklyReportDetailDto)
async def get_weekly_report(project_id: str, report_id: str, request: Request) -> WeeklyReportDetailDto:
  service = WeeklyReportRetrievalService(WeeklyReportReadRepository(request))
  report = await service.get_project_report(project_id, report_id)
  if not report:
    raise HTTPException(status_code=404, detail="Weekly report not found")
  return report
