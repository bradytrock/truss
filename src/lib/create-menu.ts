export type CreateAction =
  | "opportunity"
  | "client"
  | "event"
  | "task"
  | "payment"
  | "expense"
  | "forecast";

export type CreateMenuIcon =
  | "lead"
  | "contact"
  | "event"
  | "task"
  | "payment"
  | "expense"
  | "forecast";

export type CreateMenuItem = {
  action: CreateAction;
  label: string;
  description?: string;
  shortcut: string;
  icon: CreateMenuIcon;
};

export type CreateMenuSection = {
  id: string;
  label: string;
  items: CreateMenuItem[];
};

const CUSTOMERS: CreateMenuItem[] = [
  {
    action: "opportunity",
    label: "New lead",
    description: "Homeowner, address, roof issue",
    shortcut: "L",
    icon: "lead",
  },
  {
    action: "client",
    label: "New contact",
    description: "Adjuster, sub, supplier, referral",
    shortcut: "C",
    icon: "contact",
  },
  {
    action: "event",
    label: "Schedule event",
    description: "Inspection, estimate, install day",
    shortcut: "E",
    icon: "event",
  },
  {
    action: "task",
    label: "New task",
    description: "Follow-up or to-do with a due date",
    shortcut: "T",
    icon: "task",
  },
];

const MONEY: CreateMenuItem[] = [
  { action: "payment", label: "Log payment", shortcut: "P", icon: "payment" },
  { action: "expense", label: "Log expense", shortcut: "X", icon: "expense" },
  { action: "forecast", label: "Forecast an expense", shortcut: "F", icon: "forecast" },
];

/** Header Create menu. Business development seats keep leads, contacts, and tasks. */
export function createMenuSections(options: { bdOnly: boolean }): CreateMenuSection[] {
  const customers = options.bdOnly ? CUSTOMERS.filter((item) => item.action !== "event") : CUSTOMERS;
  const sections: CreateMenuSection[] = [{ id: "customers", label: "Customers & jobs", items: customers }];
  if (!options.bdOnly) sections.push({ id: "money", label: "Money", items: MONEY });
  return sections;
}

export function createActionForShortcut(sections: CreateMenuSection[], key: string) {
  const shortcut = key.toLowerCase();
  for (const section of sections) {
    const item = section.items.find((entry) => entry.shortcut.toLowerCase() === shortcut);
    if (item) return item.action;
  }
  return null;
}
