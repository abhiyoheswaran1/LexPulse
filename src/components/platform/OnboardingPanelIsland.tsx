"use client";

import dynamic from "next/dynamic";

const OnboardingPanel = dynamic(() => import("./OnboardingPanel").then((module) => module.OnboardingPanel), {
  ssr: false,
  loading: () => null,
});

export function OnboardingPanelIsland() {
  return <OnboardingPanel />;
}
