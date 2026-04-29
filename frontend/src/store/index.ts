import { create } from 'zustand';
import { Pollutant, Mode, Role, Scenario, GridCell, Station, Alert, EventItem } from '../types';

interface AppState {
  // Core state
  role: Role;
  mode: Mode;
  selectedPollutant: Pollutant;
  selectedTimestamp: string;
  selectedGridId: string | null;
  selectedStationId: string | null;
  selectedScenario: Scenario;
  
  // Data
  gridCells: GridCell[];
  stations: Station[];
  alerts: Alert[];
  events: EventItem[];
  
  // UI state
  isLoading: boolean;
  
  // Actions
  setRole: (role: Role) => void;
  setMode: (mode: Mode) => void;
  setSelectedPollutant: (pollutant: Pollutant) => void;
  setSelectedTimestamp: (timestamp: string) => void;
  setSelectedGridId: (gridId: string | null) => void;
  setSelectedStationId: (stationId: string | null) => void;
  setSelectedScenario: (scenario: Scenario) => void;
  setGridCells: (cells: GridCell[]) => void;
  setStations: (stations: Station[]) => void;
  setAlerts: (alerts: Alert[]) => void;
  setEvents: (events: EventItem[]) => void;
  setIsLoading: (loading: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  // Initial state
  role: 'moe',
  mode: 'NOW',
  selectedPollutant: 'PM25',
  selectedTimestamp: new Date().toISOString(),
  selectedGridId: null,
  selectedStationId: null,
  selectedScenario: 'normal',
  gridCells: [],
  stations: [],
  alerts: [],
  events: [],
  isLoading: false,
  
  // Actions
  setRole: (role) => set({ role }),
  setMode: (mode) => set({ mode }),
  setSelectedPollutant: (selectedPollutant) => set({ selectedPollutant }),
  setSelectedTimestamp: (selectedTimestamp) => set({ selectedTimestamp }),
  setSelectedGridId: (selectedGridId) => set({ selectedGridId }),
  setSelectedStationId: (selectedStationId) => set({ selectedStationId }),
  setSelectedScenario: (selectedScenario) => set({ selectedScenario }),
  setGridCells: (gridCells) => set({ gridCells }),
  setStations: (stations) => set({ stations }),
  setAlerts: (alerts) => set({ alerts }),
  setEvents: (events) => set({ events }),
  setIsLoading: (isLoading) => set({ isLoading })
}));