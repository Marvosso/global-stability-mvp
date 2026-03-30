import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GeoBackfillPanel } from "@/components/GeoBackfillPanel";

export default function AdminPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Dashboard</h2>
      <GeoBackfillPanel />
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>Admin area. Auth and feature pages coming later.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use the sidebar to navigate. Shell is responsive: sidebar toggles on small screens.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
