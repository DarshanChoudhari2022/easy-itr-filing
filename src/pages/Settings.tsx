/**
 * Settings Page - Account & Privacy Settings
 */

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    User, Lock, Bell, Shield, Eye, EyeOff, Save, Check,
    Smartphone, Mail, Key, AlertTriangle, Loader2, LogOut
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function SettingsPage() {
    const { user, signOut } = useAuth();
    const [saving, setSaving] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Profile settings
    const [profile, setProfile] = useState({
        fullName: '',
        email: '',
        phone: '',
        pan: ''
    });

    // Password change
    const [passwords, setPasswords] = useState({
        current: '',
        new: '',
        confirm: ''
    });

    // Notification settings
    const [notifications, setNotifications] = useState({
        emailAlerts: true,
        taxReminders: true,
        weeklyDigest: false,
        marketingEmails: false
    });

    // Privacy settings
    const [privacy, setPrivacy] = useState({
        showProfile: true,
        dataSharing: false,
        analyticsTracking: true
    });

    // Load user data
    useEffect(() => {
        if (user) {
            setProfile({
                fullName: user.user_metadata?.full_name || '',
                email: user.email || '',
                phone: user.phone || '',
                pan: user.user_metadata?.pan || ''
            });
        }
    }, [user]);

    // Save profile
    const handleSaveProfile = async () => {
        setSaving(true);
        try {
            const { error } = await supabase.auth.updateUser({
                data: {
                    full_name: profile.fullName,
                    pan: profile.pan
                }
            });

            if (error) throw error;
            toast.success('Profile updated successfully');
        } catch (err) {
            toast.error('Failed to update profile');
            console.error(err);
        }
        setSaving(false);
    };

    // Change password
    const handleChangePassword = async () => {
        if (passwords.new !== passwords.confirm) {
            toast.error('Passwords do not match');
            return;
        }
        if (passwords.new.length < 8) {
            toast.error('Password must be at least 8 characters');
            return;
        }

        setSaving(true);
        try {
            const { error } = await supabase.auth.updateUser({
                password: passwords.new
            });

            if (error) throw error;
            toast.success('Password changed successfully');
            setPasswords({ current: '', new: '', confirm: '' });
        } catch (err) {
            toast.error('Failed to change password');
            console.error(err);
        }
        setSaving(false);
    };

    // Save notification settings
    const handleSaveNotifications = () => {
        localStorage.setItem('notificationSettings', JSON.stringify(notifications));
        toast.success('Notification preferences saved');
    };

    // Save privacy settings
    const handleSavePrivacy = () => {
        localStorage.setItem('privacySettings', JSON.stringify(privacy));
        toast.success('Privacy settings saved');
    };

    return (
        <AppLayout>
            <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
                    <p className="text-slate-500 mt-1">Manage your account preferences and security</p>
                </div>

                <Tabs defaultValue="account" className="space-y-6">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="account" className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <span className="hidden sm:inline">Account</span>
                        </TabsTrigger>
                        <TabsTrigger value="security" className="flex items-center gap-2">
                            <Lock className="h-4 w-4" />
                            <span className="hidden sm:inline">Security</span>
                        </TabsTrigger>
                        <TabsTrigger value="notifications" className="flex items-center gap-2">
                            <Bell className="h-4 w-4" />
                            <span className="hidden sm:inline">Notifications</span>
                        </TabsTrigger>
                        <TabsTrigger value="privacy" className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            <span className="hidden sm:inline">Privacy</span>
                        </TabsTrigger>
                    </TabsList>

                    {/* Account Settings */}
                    <TabsContent value="account">
                        <Card>
                            <CardHeader>
                                <CardTitle>Profile Information</CardTitle>
                                <CardDescription>Update your personal details</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Full Name</Label>
                                        <Input
                                            value={profile.fullName}
                                            onChange={e => setProfile({ ...profile, fullName: e.target.value })}
                                            placeholder="Enter your full name"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Email</Label>
                                        <Input value={profile.email} disabled className="bg-slate-50" />
                                        <p className="text-xs text-slate-500">Email cannot be changed</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Phone Number</Label>
                                        <Input
                                            value={profile.phone}
                                            onChange={e => setProfile({ ...profile, phone: e.target.value })}
                                            placeholder="+91 XXXXX XXXXX"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>PAN Number</Label>
                                        <Input
                                            value={profile.pan}
                                            onChange={e => setProfile({ ...profile, pan: e.target.value.toUpperCase() })}
                                            placeholder="ABCDE1234F"
                                            maxLength={10}
                                        />
                                    </div>
                                </div>

                                <Separator />

                                <div className="flex justify-end">
                                    <Button onClick={handleSaveProfile} disabled={saving}>
                                        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                        Save Changes
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Security Settings */}
                    <TabsContent value="security">
                        <div className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Change Password</CardTitle>
                                    <CardDescription>Update your account password</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Current Password</Label>
                                        <div className="relative">
                                            <Input
                                                type={showPassword ? 'text' : 'password'}
                                                value={passwords.current}
                                                onChange={e => setPasswords({ ...passwords, current: e.target.value })}
                                                placeholder="Enter current password"
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-2 top-1/2 -translate-y-1/2"
                                                onClick={() => setShowPassword(!showPassword)}
                                            >
                                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>New Password</Label>
                                            <Input
                                                type="password"
                                                value={passwords.new}
                                                onChange={e => setPasswords({ ...passwords, new: e.target.value })}
                                                placeholder="Enter new password"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Confirm Password</Label>
                                            <Input
                                                type="password"
                                                value={passwords.confirm}
                                                onChange={e => setPasswords({ ...passwords, confirm: e.target.value })}
                                                placeholder="Confirm new password"
                                            />
                                        </div>
                                    </div>
                                    <Button onClick={handleChangePassword} disabled={saving}>
                                        <Key className="h-4 w-4 mr-2" />
                                        Update Password
                                    </Button>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center justify-between">
                                        Two-Factor Authentication
                                        <Badge variant="secondary">Coming Soon</Badge>
                                    </CardTitle>
                                    <CardDescription>Add an extra layer of security to your account</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Alert>
                                        <Smartphone className="h-4 w-4" />
                                        <AlertDescription>
                                            Two-factor authentication using authenticator apps will be available soon.
                                        </AlertDescription>
                                    </Alert>
                                </CardContent>
                            </Card>

                            <Card className="border-red-200">
                                <CardHeader>
                                    <CardTitle className="text-red-600">Danger Zone</CardTitle>
                                </CardHeader>
                                <CardContent className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Sign out from all devices</p>
                                        <p className="text-sm text-slate-500">This will log you out everywhere</p>
                                    </div>
                                    <Button variant="destructive" onClick={() => signOut()}>
                                        <LogOut className="h-4 w-4 mr-2" />
                                        Sign Out
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* Notification Settings */}
                    <TabsContent value="notifications">
                        <Card>
                            <CardHeader>
                                <CardTitle>Notification Preferences</CardTitle>
                                <CardDescription>Control how you receive updates</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Email Alerts</p>
                                        <p className="text-sm text-slate-500">Receive important account notifications</p>
                                    </div>
                                    <Switch
                                        checked={notifications.emailAlerts}
                                        onCheckedChange={v => setNotifications({ ...notifications, emailAlerts: v })}
                                    />
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Tax Filing Reminders</p>
                                        <p className="text-sm text-slate-500">Reminders for due dates and deadlines</p>
                                    </div>
                                    <Switch
                                        checked={notifications.taxReminders}
                                        onCheckedChange={v => setNotifications({ ...notifications, taxReminders: v })}
                                    />
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Weekly Digest</p>
                                        <p className="text-sm text-slate-500">Summary of your tax activities</p>
                                    </div>
                                    <Switch
                                        checked={notifications.weeklyDigest}
                                        onCheckedChange={v => setNotifications({ ...notifications, weeklyDigest: v })}
                                    />
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Marketing Emails</p>
                                        <p className="text-sm text-slate-500">Product updates and new features</p>
                                    </div>
                                    <Switch
                                        checked={notifications.marketingEmails}
                                        onCheckedChange={v => setNotifications({ ...notifications, marketingEmails: v })}
                                    />
                                </div>

                                <div className="flex justify-end pt-4">
                                    <Button onClick={handleSaveNotifications}>
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Preferences
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Privacy Settings */}
                    <TabsContent value="privacy">
                        <Card>
                            <CardHeader>
                                <CardTitle>Privacy Settings</CardTitle>
                                <CardDescription>Control your data and privacy</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Profile Visibility</p>
                                        <p className="text-sm text-slate-500">Allow CAs to find your profile</p>
                                    </div>
                                    <Switch
                                        checked={privacy.showProfile}
                                        onCheckedChange={v => setPrivacy({ ...privacy, showProfile: v })}
                                    />
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Data Sharing</p>
                                        <p className="text-sm text-slate-500">Share anonymized data for improvements</p>
                                    </div>
                                    <Switch
                                        checked={privacy.dataSharing}
                                        onCheckedChange={v => setPrivacy({ ...privacy, dataSharing: v })}
                                    />
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Analytics Tracking</p>
                                        <p className="text-sm text-slate-500">Help us improve with usage analytics</p>
                                    </div>
                                    <Switch
                                        checked={privacy.analyticsTracking}
                                        onCheckedChange={v => setPrivacy({ ...privacy, analyticsTracking: v })}
                                    />
                                </div>

                                <div className="flex justify-end pt-4">
                                    <Button onClick={handleSavePrivacy}>
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Settings
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </AppLayout>
    );
}
