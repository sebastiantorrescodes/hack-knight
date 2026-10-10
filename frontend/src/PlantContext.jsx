import { createContext, useContext, useMemo } from "react";
import { plantApi } from "./api";

const PlantContext = createContext(null);

/** Makes the selected plant and its API calls available to the dashboard below it. */
export function PlantProvider({ plant, children }) {
  const api = useMemo(() => plantApi(plant.id), [plant.id]);
  const value = useMemo(() => ({ plant, api }), [plant, api]);
  return <PlantContext.Provider value={value}>{children}</PlantContext.Provider>;
}

/** { plant, api } for the plant being shown. */
export const usePlant = () => useContext(PlantContext);
