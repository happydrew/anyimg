import { createContext, useEffect, useState } from 'react'
import { addFreeUsage, checkFreeUsage } from '@lib/usageChecker';
import { FREE_MAX_CREDITS } from '@config';
import { useAuth } from './AuthContext';

type FreeCreditsContextType = {
    freeCredits: number
    useFreeCredits: (credits: number) => void
}

export const FreeCreditsContext = createContext<FreeCreditsContextType | undefined>(undefined)

export function FreeCreditsProvider({ children }: { children: React.ReactNode }) {
    const [freeCredits, setFreeCredits] = useState<number>(0)
    const { user } = useAuth()

    // 只在用户未登录时才检查免费使用次数
    useEffect(() => {
        if (!user) {
            checkFreeUsage().then((freeUsage) => {
                console.log('Free usage:', freeUsage);
                setFreeCredits(FREE_MAX_CREDITS - freeUsage);
            }).catch((error) => {
                console.error('Failed to check usage:', error);
                setFreeCredits(FREE_MAX_CREDITS);
            });
        }
    }, [user]);

    const useFreeCredits = (credits: number) => {
        setFreeCredits(prev => prev - credits);
        addFreeUsage(credits);
    }


    const value = {
        freeCredits,
        useFreeCredits
    }

    return <FreeCreditsContext.Provider value={value}>
        {children}
    </FreeCreditsContext.Provider>
}