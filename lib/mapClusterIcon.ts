import L from "leaflet";

/** Cluster bubble for MarkerClusterGroup — readable on satellite and street tiles. */
export function createMapClusterIcon(
  cluster: { getChildCount(): number }
): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 34 : count < 100 ? 40 : 44;
  const fontSize = count < 10 ? 13 : count < 100 ? 12 : 11;
  return L.divIcon({
    className: "gs-map-cluster",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(145deg,rgba(15,23,42,0.94),rgba(30,41,59,0.92));color:#f8fafc;border:2.5px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${fontSize}px;line-height:1">${count}</div>`,
    iconSize: L.point(size, size),
  });
}
