// Temporary ambient declarations for untyped Shadcn .jsx UI primitives until converted to .tsx
declare module '@/components/ui/*' {
  import type { ComponentType } from 'react';
  const AnyComponent: ComponentType<any>;
  export const Button: ComponentType<any>;
  export const Input: ComponentType<any>;
  export const Badge: ComponentType<any>;
  export const Card: ComponentType<any>;
  export const CardContent: ComponentType<any>;
  export const CardHeader: ComponentType<any>;
  export const CardTitle: ComponentType<any>;
  export const CardDescription: ComponentType<any>;
  export const CardFooter: ComponentType<any>;
  export const Tabs: ComponentType<any>;
  export const TabsContent: ComponentType<any>;
  export const TabsList: ComponentType<any>;
  export const TabsTrigger: ComponentType<any>;
  export const Dialog: ComponentType<any>;
  export const DialogContent: ComponentType<any>;
  export const DialogHeader: ComponentType<any>;
  export const DialogTitle: ComponentType<any>;
  export const DialogDescription: ComponentType<any>;
  export const DialogFooter: ComponentType<any>;
  export default AnyComponent;
}
