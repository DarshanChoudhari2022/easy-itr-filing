import { useState, useEffect } from 'react';
import {
    Building2, Plus, Trash2, Star, CreditCard, AlertCircle, Loader2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useToast } from '../hooks/use-toast';
import {
    saveBankDetails, getBankDetails, deleteBankDetail,
    BankDetailsData
} from '../lib/supabase-data-service';
import { isValidIFSC, isValidAccountNumber } from '../lib/validators';

interface BankAccount {
    id: string;
    account_number: string;
    ifsc_code: string;
    bank_name: string;
    account_type: string;
    is_refund_account: boolean;
    is_primary: boolean;
}

export default function BankDetailsManager() {
    const { toast } = useToast();
    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [newAccount, setNewAccount] = useState<BankDetailsData>({
        account_number: '',
        ifsc_code: '',
        bank_name: '',
        account_type: 'SB',
        is_refund_account: false,
        is_primary: false,
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        loadAccounts();
    }, []);

    const loadAccounts = async () => {
        try {
            const data = await getBankDetails();
            setAccounts(data as unknown as BankAccount[]);
        } catch (error: any) {
            console.error('Error loading bank accounts:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const validateAccount = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!newAccount.account_number || !isValidAccountNumber(newAccount.account_number)) {
            newErrors.account_number = 'Enter a valid account number (9-18 digits)';
        }
        if (!newAccount.ifsc_code || !isValidIFSC(newAccount.ifsc_code)) {
            newErrors.ifsc_code = 'Enter a valid IFSC code (e.g., SBIN0001234)';
        }
        if (!newAccount.bank_name || newAccount.bank_name.trim().length < 2) {
            newErrors.bank_name = 'Bank name is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleAdd = async () => {
        if (!validateAccount()) return;

        setIsSaving(true);
        try {
            // If this is the first account or marked primary, make it the refund account
            const isPrimary = accounts.length === 0 || newAccount.is_primary;
            await saveBankDetails({
                ...newAccount,
                ifsc_code: newAccount.ifsc_code.toUpperCase(),
                is_primary: isPrimary,
                is_refund_account: isPrimary,
            });

            toast({ title: '✅ Bank account added successfully' });
            setIsAdding(false);
            setNewAccount({
                account_number: '',
                ifsc_code: '',
                bank_name: '',
                account_type: 'SB',
                is_refund_account: false,
                is_primary: false,
            });
            setErrors({});
            await loadAccounts();
        } catch (error: any) {
            toast({
                title: 'Error adding account',
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteBankDetail(id);
            toast({ title: 'Bank account removed' });
            await loadAccounts();
        } catch (error: any) {
            toast({
                title: 'Error removing account',
                description: error.message,
                variant: 'destructive',
            });
        }
    };

    const maskAccountNumber = (num: string): string => {
        if (num.length <= 4) return num;
        return '××××' + num.slice(-4);
    };

    if (isLoading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-indigo-600" />
                            Bank Accounts
                        </CardTitle>
                        <CardDescription>
                            Add your bank account for refund credit. At least one bank account is required for ITR filing.
                        </CardDescription>
                    </div>
                    {!isAdding && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsAdding(true)}
                            className="gap-1"
                        >
                            <Plus className="h-4 w-4" /> Add Account
                        </Button>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Existing accounts */}
                {accounts.length === 0 && !isAdding && (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                        <CreditCard className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm text-gray-500 mb-3">No bank accounts added yet</p>
                        <Button size="sm" onClick={() => setIsAdding(true)} className="gap-1">
                            <Plus className="h-4 w-4" /> Add Bank Account
                        </Button>
                    </div>
                )}

                {accounts.map(account => (
                    <div key={account.id} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-indigo-200 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center">
                                <Building2 className="h-5 w-5 text-indigo-600" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-gray-900">{account.bank_name}</p>
                                    {account.is_primary && (
                                        <Badge className="bg-amber-100 text-amber-700 text-[10px]">
                                            <Star className="h-3 w-3 mr-0.5 fill-amber-500" /> Primary
                                        </Badge>
                                    )}
                                    {account.is_refund_account && (
                                        <Badge variant="outline" className="text-[10px] text-green-600 border-green-200">
                                            Refund A/C
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500">
                                    A/C: {maskAccountNumber(account.account_number)} • IFSC: {account.ifsc_code} • {account.account_type === 'SB' ? 'Savings' : account.account_type === 'CA' ? 'Current' : 'Other'}
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(account.id)}
                            className="text-gray-400 hover:text-red-500"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ))}

                {/* Add new account form */}
                {isAdding && (
                    <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-lg space-y-4">
                        <p className="text-sm font-medium text-indigo-900">Add New Bank Account</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="bank_name" className="text-xs">Bank Name *</Label>
                                <Input
                                    id="bank_name"
                                    value={newAccount.bank_name}
                                    onChange={e => setNewAccount(prev => ({ ...prev, bank_name: e.target.value }))}
                                    placeholder="e.g., State Bank of India"
                                    className={`mt-1 bg-white ${errors.bank_name ? 'border-red-400' : ''}`}
                                />
                                {errors.bank_name && <p className="text-xs text-red-500 mt-0.5">{errors.bank_name}</p>}
                            </div>
                            <div>
                                <Label htmlFor="ifsc_code" className="text-xs">IFSC Code *</Label>
                                <Input
                                    id="ifsc_code"
                                    value={newAccount.ifsc_code}
                                    onChange={e => setNewAccount(prev => ({ ...prev, ifsc_code: e.target.value.toUpperCase() }))}
                                    placeholder="e.g., SBIN0001234"
                                    maxLength={11}
                                    className={`mt-1 bg-white uppercase ${errors.ifsc_code ? 'border-red-400' : ''}`}
                                />
                                {errors.ifsc_code && <p className="text-xs text-red-500 mt-0.5">{errors.ifsc_code}</p>}
                            </div>
                            <div>
                                <Label htmlFor="account_number" className="text-xs">Account Number *</Label>
                                <Input
                                    id="account_number"
                                    value={newAccount.account_number}
                                    onChange={e => setNewAccount(prev => ({ ...prev, account_number: e.target.value.replace(/\D/g, '') }))}
                                    placeholder="e.g., 12345678901"
                                    maxLength={18}
                                    className={`mt-1 bg-white ${errors.account_number ? 'border-red-400' : ''}`}
                                />
                                {errors.account_number && <p className="text-xs text-red-500 mt-0.5">{errors.account_number}</p>}
                            </div>
                            <div>
                                <Label className="text-xs">Account Type</Label>
                                <Select
                                    value={newAccount.account_type}
                                    onValueChange={v => setNewAccount(prev => ({ ...prev, account_type: v }))}
                                >
                                    <SelectTrigger className="mt-1 bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="SB">Savings</SelectItem>
                                        <SelectItem value="CA">Current</SelectItem>
                                        <SelectItem value="OTH">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={newAccount.is_refund_account}
                                    onChange={e => setNewAccount(prev => ({ ...prev, is_refund_account: e.target.checked, is_primary: e.target.checked ? true : prev.is_primary }))}
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-xs text-gray-700">Use for refund credit</span>
                            </label>
                        </div>

                        <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            The Income Tax department will credit your refund to the designated bank account
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => { setIsAdding(false); setErrors({}); }}>
                                Cancel
                            </Button>
                            <Button size="sm" onClick={handleAdd} disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-700">
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                                {isSaving ? 'Saving...' : 'Add Account'}
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
