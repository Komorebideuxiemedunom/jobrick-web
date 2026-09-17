import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** Fusionne des classes Tailwind en resolvant les conflits (shadcn). */
export const cn = (...inputs: Array<ClassValue>) => twMerge(clsx(inputs))
