const FC_DISQUALIFIERS = ['Failed'];
const PFC_REQUIRED = ['PerfectPlus'];
const ALL_JUDGMENTS = ['PerfectPlus', 'Perfect', 'Great', 'Good', 'OK', 'Bad', 'Failed'];

export function isFc(judgments) {
	if (!judgments || typeof judgments !== 'object') return false;
	const total = ALL_JUDGMENTS.reduce((sum, k) => sum + (judgments[k] ?? 0), 0);
	if (total === 0) return false;
	return FC_DISQUALIFIERS.every(k => (judgments[k] ?? 0) === 0);
}

export function isPfc(judgments) {
	if (!judgments || typeof judgments !== 'object') return false;
	const total = ALL_JUDGMENTS.reduce((sum, k) => sum + (judgments[k] ?? 0), 0);
	if (total === 0) return false;
	const pfcTotal = PFC_REQUIRED.reduce((sum, k) => sum + (judgments[k] ?? 0), 0);
	return pfcTotal === total;
}
