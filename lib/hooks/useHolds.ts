'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Hold, HoldType, HoldSize } from '@climbset/shared/types';
import {
	addHold as addHoldUtil,
	removeHold as removeHoldUtil,
	updateHold as updateHoldUtil,
	clearHolds as clearHoldsUtil,
	toggleSequencing,
	findHoldNearPoint,
	cycleHoldType as cycleHoldTypeUtil
} from '@climbset/shared/utils/holds';

const STORAGE_KEY = 'climbset-draft';

export function useHolds(initialHolds: Hold[] = []) {
	const getStoredHolds = () => {
		if (typeof window === 'undefined') return initialHolds;
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) return initialHolds;
		try {
			const parsed = JSON.parse(saved);
			return Array.isArray(parsed) ? parsed : initialHolds;
		} catch {
			return initialHolds;
		}
	};

	const [holds, setHolds] = useState<Hold[]>(getStoredHolds);
	const [selectedType, setSelectedType] = useState<HoldType>('hand');
	const [selectedSize, setSelectedSize] = useState<HoldSize>('medium');
	const [showSequence, setShowSequence] = useState(false);

	// History stores complete snapshots, including the initial state. This keeps
	// undo and redo symmetric (add -> undo -> redo restores the added hold).
	const historyRef = useRef<Hold[][]>([holds]);
	const historyIndexRef = useRef(0);
	const [historyMeta, setHistoryMeta] = useState({ index: 0, length: 1 });

	// Save to localStorage whenever holds change
	useEffect(() => {
		if (typeof window !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(holds));
		}
	}, [holds]);

	// Record the state after a mutation and discard any redo branch.
	const pushToHistory = useCallback((state: Hold[]) => {
		historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
		historyRef.current.push(state);
		historyIndexRef.current = historyRef.current.length - 1;
		setHistoryMeta({ index: historyIndexRef.current, length: historyRef.current.length });
	}, []);

	// Add hold at coordinates
	const addHold = useCallback(
		(x: number, y: number) => {
			setHolds((prev) => {
				const updated = addHoldUtil(prev, x, y, selectedType, selectedSize);
				if (updated.length !== prev.length) {
					pushToHistory(updated);
				}
				return updated;
			});
		},
		[selectedType, selectedSize, pushToHistory]
	);

	// Remove hold at coordinates
	const removeHold = useCallback(
		(x: number, y: number) => {
			setHolds((prev) => {
				const updated = removeHoldUtil(prev, x, y);
				if (updated.length !== prev.length) {
					pushToHistory(updated);
				}
				return updated;
			});
		},
		[pushToHistory]
	);

	// Tap on hold to cycle type (for mobile)
	const handleTap = useCallback(
		(x: number, y: number) => {
			setHolds((prev) => {
				const existingHold = findHoldNearPoint(prev, x, y);

				if (existingHold) {
					// Hold exists - cycle its type
					const updated = cycleHoldTypeUtil(prev, existingHold.id);
					pushToHistory(updated);
					return updated;
				} else {
					// No hold - add a new one
					const updated = addHoldUtil(prev, x, y, selectedType, selectedSize);
					if (updated.length !== prev.length) {
						pushToHistory(updated);
					}
					return updated;
				}
			});
		},
		[selectedType, selectedSize, pushToHistory]
	);

	// Update a specific hold
	const updateHold = useCallback(
		(holdId: string, updates: Partial<Hold>) => {
			setHolds((prev) => {
				const updated = updateHoldUtil(prev, holdId, updates);
				pushToHistory(updated);
				return updated;
			});
		},
		[pushToHistory]
	);

	const clearHolds = useCallback(() => {
		setHolds((prev) => {
			if (prev.length > 0) {
				pushToHistory([]);
			}
			return clearHoldsUtil();
		});
	}, [pushToHistory]);

	// Set all holds (for loading)
	const setAllHolds = useCallback((newHolds: Hold[]) => {
		setHolds(newHolds);
		historyRef.current = [newHolds];
		historyIndexRef.current = 0;
		setHistoryMeta({ index: 0, length: 1 });
	}, []);

	// Clear draft from localStorage
	const clearDraft = useCallback(() => {
		if (typeof window !== 'undefined') {
			localStorage.removeItem(STORAGE_KEY);
		}
		setHolds([]);
		historyRef.current = [[]];
		historyIndexRef.current = 0;
		setHistoryMeta({ index: 0, length: 1 });
	}, []);

	// Undo
	const undo = useCallback(() => {
		const historyIndex = historyIndexRef.current;

		if (historyIndex > 0) {
			const previousState = historyRef.current[historyIndex - 1];
			historyIndexRef.current = historyIndex - 1;
			setHolds(previousState);
			setHistoryMeta({ index: historyIndexRef.current, length: historyRef.current.length });
		}
	}, []);

	// Redo
	const redo = useCallback(() => {
		const historyIndex = historyIndexRef.current;

		if (historyIndex < historyRef.current.length - 1) {
			const nextState = historyRef.current[historyIndex + 1];
			historyIndexRef.current = historyIndex + 1;
			setHolds(nextState);
			setHistoryMeta({ index: historyIndexRef.current, length: historyRef.current.length });
		}
	}, []);

	// Toggle sequence visibility
	const toggleSequenceVisibility = useCallback((enable: boolean) => {
		setShowSequence(enable);
		setHolds((prev) => toggleSequencing(prev, enable));
	}, []);

	// Compute canUndo/canRedo from state
	const canUndo = historyMeta.index > 0;
	const canRedo = historyMeta.index < historyMeta.length - 1;

	return {
		holds: holds || [], // Always return an array
		selectedType,
		selectedSize,
		showSequence,
		setSelectedType,
		setSelectedSize,
		addHold,
		removeHold,
		updateHold,
		handleTap,
		clearHolds,
		setAllHolds,
		clearDraft,
		undo,
		redo,
		canUndo,
		canRedo,
		toggleSequenceVisibility
	};
}
