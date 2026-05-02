import { DashboardOverview } from "../components/DashboardOverview";
import { SetLevelFindings } from "../components/SetLevelFindings";

export function DashboardPage() {
  return (
    <div className="lv-page">
      <DashboardOverview />
      <SetLevelFindings />
    </div>
  );
}
