import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { checkFreeUsage, useOneFreeGeneration } from '@lib/usageChecker';
// 修正导入
import { useAuth } from '@/contexts/AuthContext';
import UpgradeModal from '@components/UpgradeModal';
import AdModal from './AdModal';
import ImageViewerModal from './ImageViewerModal';
import TurnstileModal from './TurnstileModal';
import ImageComparisonCard from './ImageComparisonCard';

// 定义历史记录类型
interface HistoryItem {
    originalImages: string[];
    ghibliImage: string;
    timestamp: number;
    prompt?: string;
    size?: string;
}

const MAX_FREE = 3;
const MAX_IMAGES = 1;
const FREE_MAX_IMAGES = 1;

const CHECK_STATUS_INTERVAL = 60000;

const HomePage = () => {
    // 使用AuthContext
    const { user, credits, setIsLoginModalOpen, setLoginModalRedirectTo, getAccessToken } = useAuth();

    const [prompt, setPrompt] = useState('');
    const [selectedImage, setSelectedImage] = useState('');
    const [showImageViewer, setShowImageViewer] = useState(false);
    const [uploadedImages, setUploadedImages] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [generationError, setGenerationError] = useState('');
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // 新增状态控制广告显示
    const [showPreGenAd, setShowPreGenAd] = useState(false);
    const [showPostGenAd, setShowPostGenAd] = useState(false);
    const [isResultBlurred, setIsResultBlurred] = useState(false);
    const [pendingGeneration, setPendingGeneration] = useState(false);
    const [showTurnstile, setShowTurnstile] = useState(false);
    const [freeCredits, setFreeCredits] = useState(0);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [imageUploading, setImageUploading] = useState(false);
    const [selectedSize, setSelectedSize] = useState('1:1');

    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // 添加提示信息数组
    const waitingTips = [
        "Creating your Ghibli-style masterpiece with GPT-4o, do not refresh the page",
        "Transform your photo into Studio Ghibli style with our free generator",
        "Our AI is carefully crafting your artistic Ghibli transformation",
        "ChatGPT's Ghibli style generator is working its magic",
        "Converting your image to Ghibli style with best-in-class AI technology"
    ];

    const [currentTipIndex, setCurrentTipIndex] = useState(0);
    const tipIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // 只在用户未登录时才检查免费使用次数
    useEffect(() => {
        if (!user) {
            checkFreeUsage().then((freeUsage) => {
                console.log('Free usage:', freeUsage);
                setFreeCredits(MAX_FREE - freeUsage);
            }).catch((error) => {
                console.error('Failed to check usage:', error);
                setFreeCredits(MAX_FREE);
            });
        }
    }, [user]);

    // 加载历史记录
    useEffect(() => {
        const savedHistory = localStorage.getItem('ghibliImageHistory');
        if (savedHistory) {
            try {
                setHistory(JSON.parse(savedHistory));
            } catch (e) {
                console.error('Failed to parse history:', e);
            }
        }
    }, []);

    // 保存历史记录
    useEffect(() => {
        if (history.length > 0) {
            let saveSuccess = false;
            while (!saveSuccess) {
                try {
                    localStorage.setItem('ghibliImageHistory', JSON.stringify(history));
                    saveSuccess = true;
                } catch (e) {
                    console.error('Failed to save history,exceed the quota:', e);
                    history.shift(); // 移除最早的记录
                }
            }
        }
    }, [history]);

    // 在页面加载时恢复任务状态
    useEffect(() => {
        const savedTaskId = localStorage.getItem('pendingTaskId');
        const savedUploadedImages = localStorage.getItem('pendingUploadedImages');
        const savedSize = localStorage.getItem('pendingSize');

        if (savedTaskId && savedUploadedImages) {
            try {
                setUploadedImages(JSON.parse(savedUploadedImages));
                if (savedSize) {
                    setSelectedSize(savedSize);
                }
                setIsGenerating(true);
                startPollingTaskStatus(savedTaskId);
            } catch (e) {
                console.error('Failed to parse saved uploaded images:', e);
            }
        }
    }, []);

    // 添加轮动提示的effect
    useEffect(() => {
        if (isGenerating) {
            // 清除之前的interval
            if (tipIntervalRef.current) {
                clearInterval(tipIntervalRef.current);
            }

            // 设置新的interval
            const intervalId = setInterval(() => {
                setCurrentTipIndex(prev => (prev + 1) % waitingTips.length);
            }, 5000);

            tipIntervalRef.current = intervalId;
        } else {
            // 停止轮动
            if (tipIntervalRef.current) {
                clearInterval(tipIntervalRef.current);
                tipIntervalRef.current = null;
            }
        }

        // 清理函数
        return () => {
            if (tipIntervalRef.current) {
                clearInterval(tipIntervalRef.current);
            }
        };
    }, [isGenerating]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        setImageUploading(true);
        try {
            const files = e.target.files;
            if (!files || files.length === 0) return;

            // 限制最多上传5张图片
            const filesToProcess = Math.min(files.length, MAX_IMAGES - uploadedImages.length);

            // 免费用户尝试上传多张图片时，显示升级提示框
            if (!user && (files.length > 1 || uploadedImages.length >= FREE_MAX_IMAGES)) {
                setShowUpgradeModal(true);
                setImageUploading(false);
                return;
            }

            // 处理每个文件（不超过限制）
            for (let i = 0; i < filesToProcess; i++) {
                const file = files[i];

                // 检查文件类型
                if (!file.type.startsWith('image/')) {
                    alert('Please upload image files only');
                    continue;
                }

                // 检查文件大小（限制为5MB）
                if (file.size > 5 * 1024 * 1024) {
                    alert('Image size should be less than 5MB');
                    continue;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    if (event.target?.result) {
                        const img = document.createElement('img');
                        img.crossOrigin = 'anonymous'; // Handle cross-origin issues
                        img.onload = () => {
                            let width = img.width;
                            let height = img.height;

                            // Resize large images proportionally
                            if (width > 1024) {
                                height = Math.round((height * 1024) / width);
                                width = 1024;
                            }

                            // Create canvas for image resizing and compression
                            const canvas = document.createElement('canvas');
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                                ctx.drawImage(img, 0, 0, width, height);
                                // Convert to WebP format
                                const webpImage = canvas.toDataURL('image/webp');
                                // Add to uploaded images array
                                setUploadedImages(prev => [...prev, webpImage]);
                            }
                            canvas.remove();
                            img.remove();
                        };
                        img.src = event.target.result as string;
                    }
                };
                reader.readAsDataURL(file);
            }

            // Clear generated image when new images are uploaded
            setGeneratedImage(null);
        } finally {
            setImageUploading(false);
        }
    };

    // 添加删除单张图片的函数
    const removeUploadedImage = (index: number, e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        setUploadedImages(prev => {
            const newImages = [...prev];
            newImages.splice(index, 1);
            return newImages;
        });

        // 如果移除了所有图片，清空生成的图片结果
        if (uploadedImages.length <= 1) {
            setGeneratedImage(null);
        }

        // 清除文件输入框的值，避免相同文件不触发onChange事件
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // 添加移除所有图片的函数
    const removeAllImages = () => {
        setUploadedImages([]);
        setGeneratedImage(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const executeGeneration = async (token: string) => {
        if (uploadedImages.length === 0) return;

        setIsGenerating(true);
        setGenerationError('');
        setShowTurnstile(false);
        setPendingGeneration(false);

        try {
            const accessToken = await getAccessToken();

            const response = await fetch('/api/generate-image/create-task', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    images: uploadedImages,
                    prompt: 'Do a ghibli style of the image',
                    size: selectedSize,
                    turnstileToken: token,
                    accessToken
                })
            });

            if (response.ok) {
                useOnce(); // Deduct credit points
                const responseData = await response.json();

                // Save task ID and uploaded images to localStorage
                localStorage.setItem('pendingTaskId', responseData.taskId);
                localStorage.setItem('pendingUploadedImages', JSON.stringify(uploadedImages));
                localStorage.setItem('pendingSize', selectedSize);
                startPollingTaskStatus(responseData.taskId);
            } else {
                const errorData = await response.json();
                taskFailed(errorData.error || 'Failed to create generation task');
            }
        } catch (error) {
            console.error('Error starting generation task:', error);
            taskFailed('Error occurred while creating generation task');
        }
    };

    // 开始轮询任务状态
    const startPollingTaskStatus = (taskId: string) => {
        // 清除之前的轮询
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
        }

        // 设置新的轮询间隔
        const intervalId = setInterval(() => {
            checkTaskStatus(taskId);
        }, CHECK_STATUS_INTERVAL); // 每30秒检查一次

        // 直接更新ref，不使用状态更新
        pollingIntervalRef.current = intervalId;
    };

    // 检查任务状态
    const checkTaskStatus = async (taskId: string) => {
        console.log(`Checking task ${taskId} status)`);
        try {
            const response = await fetch(`/api/generate-image/task-status?taskId=${taskId}`);

            if (response.ok) {
                const data = await response.json();
                console.log(`Check task ${taskId} status, response: ${JSON.stringify(data)}`);

                if (data.status === 'SUCCESS') {
                    // Handle generated images
                    if (data.generatedImage) {
                        processGeneratedImage(data.generatedImage); // Use first generated image
                    } else {
                        taskFailed('Returned image data format error');
                    }
                } else if (data.status === 'GENERATING') {
                    // Still generating, continue polling
                } else {
                    // Generation failed or other status
                    taskFailed(data.message || 'Image generation failed');
                }
            } else {
                // API request failed
                taskFailed('Failed to check task status');
            }
        } catch (error) {
            taskFailed(`Error checking task status: ${error}`);
        }
    };

    // 创建处理生成图片的函数
    const processGeneratedImage = (imageUrl: string) => {
        if (!imageUrl) {
            taskFailed('No generated image received');
            return;
        }

        // Create image element to process the image
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, img.width, img.height);
                const img_base64 = canvas.toDataURL('image/jpeg');
                setGeneratedImage(img_base64);

                // Get the current uploaded images and size
                let currentUploadedImages: string[] = [];
                try {
                    const savedImages = localStorage.getItem('pendingUploadedImages');
                    if (savedImages) {
                        currentUploadedImages = JSON.parse(savedImages);
                    } else {
                        currentUploadedImages = uploadedImages;
                    }
                } catch (e) {
                    console.error('Error parsing saved uploaded images:', e);
                    currentUploadedImages = uploadedImages;
                }

                console.log(`Check status success, using images: ${currentUploadedImages.length} images`);
                addToHistory(currentUploadedImages, img_base64);
            }
            canvas.remove();
            img.remove();

            stopPolling();
            setIsGenerating(false);
            // Clear localStorage temp data
            localStorage.removeItem('pendingTaskId');
            localStorage.removeItem('pendingUploadedImages');
            localStorage.removeItem('pendingSize');
        };
        img.src = imageUrl;
    };

    const taskFailed = (error: string) => {
        stopPolling();
        setIsGenerating(false);
        setGenerationError(error);
        // Clear localStorage temp data
        localStorage.removeItem('pendingTaskId');
        localStorage.removeItem('pendingUploadedImages');
        localStorage.removeItem('pendingSize');
        // Return user points
    };

    // 停止轮询
    const stopPolling = () => {
        console.log(`Stopping polling, pollingInterval is: ${pollingIntervalRef.current}`);
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
        setPendingGeneration(false);
    };

    const useOnce = () => {
        // 根据登录状态决定扣减哪个系统的点数
        if (!user) {
            // 未登录用户，扣减免费点数
            setFreeCredits(prev => prev - 1);
            useOneFreeGeneration();
        } else {
            // 已登录用户在后台自动扣除积分
        }
    };

    // 修改处理广告的函数
    const handleCloseAd = (isPreGenAd: boolean) => {
        if (isPreGenAd) {
            setShowPreGenAd(false);
            setPendingGeneration(false);
        } else {
            setShowPostGenAd(false);
            // 不移除模糊效果，因为用户没有查看广告
        }
    };

    const handleAdClick = async (isPreGenAd: boolean) => {
        // Open ad in new tab
        const currentWindow = window
        const newTab = window.open('https://povaique.top/4/9150862', '_blank', 'noopener noreferrer');
        if (newTab) {
            newTab.blur();
            currentWindow.focus();
        }

        if (isPreGenAd) {
            // Close pre-generation ad
            setShowPreGenAd(false);
            handleGenerateClick();
        } else {
            // Close post-generation ad and remove blur effect
            setShowPostGenAd(false);
            setIsResultBlurred(false);
            // Use uploaded images when adding to history
            if (uploadedImages.length > 0 && generatedImage) {
                addToHistory(uploadedImages, generatedImage);
            }
        }
    };

    const addToHistory = (originalImages: string[], ghibliImage: string) => {
        // Add to history record, including size
        const newHistoryItem: HistoryItem = {
            originalImages: originalImages,
            ghibliImage: ghibliImage,
            timestamp: Date.now(),
            size: selectedSize
        };

        setHistory(prev => [newHistoryItem, ...prev]);
    };

    const handleGenerateClick = () => {
        if (uploadedImages.length === 0) {
            alert('请先上传图片');
            return;
        }

        // 根据登录状态决定走哪个逻辑
        if ((!user && freeCredits <= 0) || (user && credits <= 0)) {
            // 未登录用户且免费额度已用完，或者已登录用户且账户额度已用完，弹出升级提示
            setShowUpgradeModal(true);
            return;
        }

        // 还有点数的用户可以继续生成
        setShowTurnstile(true);
        setPendingGeneration(true);
    };

    const handleImageClick = (imageSrc: string) => {
        setSelectedImage(imageSrc);
        setShowImageViewer(true);
    };

    // 清除历史记录
    const clearHistory = () => {
        if (confirm('Are you sure you want to clear all history?')) {
            setHistory([]);
            localStorage.removeItem('ghibliImageHistory');
        }
    };

    // 添加一个点击页面其他区域关闭下拉菜单的效果
    useEffect(() => {
        const closeDropdown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('#aspect-ratio-menu')) {
                const dropdown = document.getElementById('aspect-ratio-dropdown');
                if (dropdown && !dropdown.classList.contains('hidden')) {
                    dropdown.classList.add('hidden');
                }
            }
        };

        document.addEventListener('click', closeDropdown);

        return () => {
            document.removeEventListener('click', closeDropdown);
        };
    }, []);

    return (
        <div className="min-h-screen bg-white">

            {/* 添加升级计划提示框 */}
            {showUpgradeModal && <UpgradeModal onClose={() => setShowUpgradeModal(false)} />}

            {/* 添加广告模态框 */}
            {/* {showPreGenAd && (
            <AdModal
                onClose={() => handleCloseAd(true)}
                onAdClick={() => handleAdClick(true)}
                message="View an ad to generate your image for free!"
            />
        )}

        {showPostGenAd && (
            <AdModal
                onClose={() => handleCloseAd(false)}
                onAdClick={() => handleAdClick(false)}
                message="View an ad to see your image in full quality!"
            />
        )} */}

            {/* 添加图片查看器 */}
            {showImageViewer && selectedImage && (
                <ImageViewerModal
                    imageSrc={selectedImage}
                    onClose={() => setShowImageViewer(false)}
                />
            )}

            {/* 添加Turnstile验证模态框 */}
            {showTurnstile && (
                <TurnstileModal
                    onSuccess={(token) => {
                        if (token) {
                            executeGeneration(token);
                        } else {
                            setPendingGeneration(false);
                            setShowTurnstile(false);
                        }
                    }}
                    onClose={() => {
                        setShowTurnstile(false);
                        setPendingGeneration(false);
                    }}
                />
            )}

            <main className="pt-8">
                {/* 英雄区域 */}
                <div id="hero_containter" className='w-full flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12'>
                    {/* <div data-banner-id="1444036"></div> */}
                    <section className="w-full md:max-w-auto container mx-auto px-4 py-8 text-center">
                        <h1 className="text-5xl md:text-6xl font-bold mb-6 text-[#1c4c3b]">Ghibli Style Image Generator</h1>
                        <p className="text-xl md:text-2xl text-[#506a3a] mb-6 max-w-3xl mx-auto">
                            Transform your images into Ghibli style with one click
                        </p>
                        <p className="text-md text-[#506a3a] mb-12 max-w-3xl mx-auto">
                            Powered by ChatGPT-4o | Fast, accurate Ghibli style transformation
                        </p>
                        <div className="bg-[#e7f0dc] p-6 rounded-xl max-w-4xl mx-auto shadow-lg border border-[#89aa7b]">
                            <h2 className="text-2xl font-bold mb-6 text-[#1c4c3b]">Convert Image to Ghibli Style</h2>

                            {/* 上传图片区域 */}
                            <div className="mb-6">
                                <div className="p-4 border-2 border-dashed border-[#89aa7b] rounded-lg bg-white/90 text-center cursor-pointer" onClick={() => {
                                    if (fileInputRef.current) {
                                        fileInputRef.current.click();
                                    }
                                }}>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple={true} // Allow multiple file selection
                                        className="hidden"
                                        ref={fileInputRef}
                                        onChange={handleImageUpload}
                                        title="Upload image"
                                        aria-label="Upload image"
                                    />

                                    {uploadedImages.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {uploadedImages.map((img, index) => (
                                                <div key={index} className="relative h-24 bg-gray-50">
                                                    <img
                                                        src={img}
                                                        alt={`Uploaded image ${index + 1}`}
                                                        className="h-full w-full object-contain rounded-lg"
                                                    />
                                                    <div className="absolute bottom-1 right-1">
                                                        <button
                                                            className="bg-white/80 p-1 rounded-full text-[#1c4c3b] hover:bg-white transition"
                                                            onClick={(e) => removeUploadedImage(index, e)}
                                                            title="Remove uploaded image"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Show upload more button if limit not reached */}
                                            {uploadedImages.length < MAX_IMAGES && (
                                                <div className="flex justify-center items-center border-2 border-dashed border-[#89aa7b] rounded-lg p-4 h-24">
                                                    <div className="text-[#89aa7b] text-center">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                        </svg>
                                                        <span className="text-sm">Add more</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-[#89aa7b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            <p className="mt-4 text-[#506a3a]">Click to upload an image or drag & drop</p>
                                            <p className="text-sm text-[#506a3a] mt-1">PNG, JPG, WEBP up to 5MB</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 移动尺寸选择器到生成按钮上方 */}
                            <div className="flex flex-col items-start justify-center mb-4">
                                <label className="block text-[#1c4c3b] font-medium mb-2 text-left">Select Output Aspect Ratio</label>
                                <div className="relative inline-block text-left">
                                    <div>
                                        <button
                                            type="button"
                                            className="inline-flex justify-between items-center w-36 rounded-md border border-[#89aa7b] px-2 py-1 bg-white text-sm font-medium text-[#1c4c3b] hover:bg-[#f8fbf3] focus:outline-none"
                                            id="aspect-ratio-menu"
                                            aria-expanded="true"
                                            aria-haspopup="true"
                                            onClick={() => {
                                                const dropdown = document.getElementById('aspect-ratio-dropdown');
                                                if (dropdown) {
                                                    dropdown.classList.toggle('hidden');
                                                }
                                            }}
                                        >
                                            <div className="flex items-center">
                                                {selectedSize === '1:1' && (
                                                    <div className="w-5 h-5 bg-[#d5e6c3] flex items-center justify-center mr-2 border border-[#89aa7b]">
                                                        <div className="w-3 h-3 bg-[#89aa7b]"></div>
                                                    </div>
                                                )}
                                                {selectedSize === '3:2' && (
                                                    <div className="w-6 h-5 bg-[#d5e6c3] flex items-center justify-center mr-2 border border-[#89aa7b]">
                                                        <div className="w-4 h-3 bg-[#89aa7b]"></div>
                                                    </div>
                                                )}
                                                {selectedSize === '2:3' && (
                                                    <div className="w-5 h-6 bg-[#d5e6c3] flex items-center justify-center mr-2 border border-[#89aa7b]">
                                                        <div className="w-3 h-4 bg-[#89aa7b]"></div>
                                                    </div>
                                                )}
                                                <span>{selectedSize}</span>
                                            </div>
                                            <svg className="-mr-1 ml-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </div>
                                    <div
                                        id="aspect-ratio-dropdown"
                                        className="hidden origin-top-left absolute left-0 mt-2 w-36 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10"
                                        role="menu"
                                        aria-orientation="vertical"
                                        aria-labelledby="aspect-ratio-menu"
                                    >
                                        <div className="py-1" role="none">
                                            <button
                                                className={`${selectedSize === '1:1' ? 'bg-[#e7f0dc] text-[#1c4c3b]' : 'text-[#506a3a]'} flex items-center px-4 py-2 text-sm w-full text-left hover:bg-[#f8fbf3]`}
                                                role="menuitem"
                                                onClick={() => {
                                                    setSelectedSize('1:1');
                                                    document.getElementById('aspect-ratio-dropdown')?.classList.add('hidden');
                                                }}
                                            >
                                                <div className="w-5 h-5 bg-[#d5e6c3] flex items-center justify-center mr-2 border border-[#89aa7b]">
                                                    <div className="w-3 h-3 bg-[#89aa7b]"></div>
                                                </div>
                                                <span>1:1</span>
                                            </button>
                                            <button
                                                className={`${selectedSize === '3:2' ? 'bg-[#e7f0dc] text-[#1c4c3b]' : 'text-[#506a3a]'} flex items-center px-4 py-2 text-sm w-full text-left hover:bg-[#f8fbf3]`}
                                                role="menuitem"
                                                onClick={() => {
                                                    setSelectedSize('3:2');
                                                    document.getElementById('aspect-ratio-dropdown')?.classList.add('hidden');
                                                }}
                                            >
                                                <div className="w-6 h-5 bg-[#d5e6c3] flex items-center justify-center mr-2 border border-[#89aa7b]">
                                                    <div className="w-4 h-3 bg-[#89aa7b]"></div>
                                                </div>
                                                <span>3:2</span>
                                            </button>
                                            <button
                                                className={`${selectedSize === '2:3' ? 'bg-[#e7f0dc] text-[#1c4c3b]' : 'text-[#506a3a]'} flex items-center px-4 py-2 text-sm w-full text-left hover:bg-[#f8fbf3]`}
                                                role="menuitem"
                                                onClick={() => {
                                                    setSelectedSize('2:3');
                                                    document.getElementById('aspect-ratio-dropdown')?.classList.add('hidden');
                                                }}
                                            >
                                                <div className="w-5 h-6 bg-[#d5e6c3] flex items-center justify-center mr-2 border border-[#89aa7b]">
                                                    <div className="w-3 h-4 bg-[#89aa7b]"></div>
                                                </div>
                                                <span>2:3</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 按钮区域 */}
                            <div className="flex flex-col justify-center mb-6 gap-2">
                                <button
                                    className={`w-auto px-6 py-3 bg-[#1c4c3b] text-white text-lg rounded-lg hover:bg-[#2a6854] transition ${isGenerating || uploadedImages.length === 0 || pendingGeneration ? 'opacity-50 cursor-not-allowed' : ''
                                        }`}
                                    onClick={() => {
                                        if (!isGenerating && uploadedImages.length > 0 && !pendingGeneration) {
                                            setPendingGeneration(true);
                                            setShowTurnstile(true);
                                        }
                                    }}
                                    disabled={isGenerating || uploadedImages.length === 0 || pendingGeneration}
                                >
                                    {isGenerating ? 'Generating Ghibli Art...' : pendingGeneration ? 'Verifying...' : 'Create Ghibli Style Image'}
                                </button>

                                {/* 只在未登录状态下显示免费点数提示 */}
                                {!user && (
                                    <p className="ml-4 text-sm text-[#506a3a]">Remaining Free Ghibli Transformations: {freeCredits} &nbsp;&nbsp;
                                        <button
                                            onClick={() => {
                                                console.log(`clicking  Add Credits button, current window.location.origin is: ${window.location.origin}`);
                                                setLoginModalRedirectTo(`${window.location.origin}/temp-purchase`)
                                                setIsLoginModalOpen(true); // 打开登录模态框
                                            }}
                                            className="text-[#1c4c3b] font-medium underline"
                                        >
                                            Add Credits
                                        </button>
                                    </p>
                                )}

                                {/* 已登录用户不在这里显示点数信息，因为右上角的用户信息区已经有用户点数信息了 */}
                            </div>

                            <p className="text-sm text-[#506a3a] mt-4">
                                Powered by <span className="font-semibold">ChatGPT-4o technology</span> | Fast, accurate Ghibli style transformation
                            </p>
                        </div>
                    </section>
                    {/* <div data-banner-id="1444051"></div> */}
                </div>


                {/* 生成结果区域 */}
                {(isGenerating || generatedImage || generationError) && (
                    <section className="container mx-auto px-4 py-8">
                        <h2 className="text-2xl font-bold mb-6 text-center text-[#1c4c3b]">Your Ghibli Style Transformation</h2>

                        {isGenerating && (
                            <div className="flex justify-center items-center p-12">
                                <div className="relative inline-flex">
                                    <div className="w-16 h-16 border-4 border-[#e7f0dc] border-t-[#1c4c3b] rounded-full animate-spin"></div>
                                    <span className="sr-only">Loading...</span>
                                </div>
                                <div className="ml-4">
                                    <p className="text-lg text-[#1c4c3b]">{waitingTips[currentTipIndex]}</p>
                                </div>
                            </div>
                        )}

                        {generationError && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center text-red-700 mb-6">
                                {generationError}
                            </div>
                        )}

                        {generatedImage && uploadedImages.length > 0 && !isGenerating && (
                            <div className="max-w-4xl mx-auto relative">
                                {/* 添加模糊效果覆盖层 */}
                                {isResultBlurred && (
                                    <div className="absolute inset-0 backdrop-blur-md z-10 flex flex-col items-center justify-center gap-2">
                                        <div className="p-4 bg-white/70 rounded-lg shadow-lg">
                                            <p className="text-lg font-medium text-[#1c4c3b]">Your image is ready!</p>
                                        </div>
                                        <button
                                            className="bg-[#1c4c3b] text-white p-3 stext-sm rounded-lg hover:bg-[#2a6854] transition"
                                            onClick={() => setShowPostGenAd(true)}
                                        >
                                            Reveal Your Ghibli Image
                                        </button>
                                    </div>
                                )}
                                <ImageComparisonCard
                                    id="generated-image-comparison-card"
                                    data-type="generated-image-comparison-card"
                                    original={uploadedImages[0]} // Use first uploaded image
                                    generate={generatedImage}
                                    tags={[['Prompt', prompt]]} // Display size in prompt area
                                />
                            </div>
                        )}
                    </section>
                )}

                {/* 历史记录区域 */}
                {history.length > 0 && (
                    <section className="container mx-auto px-4 py-8">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-[#1c4c3b]">Your Ghibli Art Gallery</h2>
                            <button
                                onClick={clearHistory}
                                className="px-3 py-1 text-sm border border-[#89aa7b] rounded-lg hover:bg-[#d5e6c3] transition text-[#506a3a]"
                            >
                                Clear History
                            </button>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {history.map((item, index) => (
                                <ImageComparisonCard
                                    key={index}
                                    original={item.originalImages[0]} // Use first image from array
                                    generate={item.ghibliImage}
                                    tags={[['Prompt', item.prompt]]}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* 改进灵感区域，包含更多prompt指南 */}
                <section id="examples" className="container mx-auto px-4 py-16">
                    <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">Ghibli Style Image Gallery</h2>
                    <p className="text-xl text-[#506a3a] mb-10 text-center">
                        See stunning examples created with our free Ghibli style image generator
                    </p>

                    <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-4 mb-12">
                        {[...Array(12)].map((_, index) => (
                            <div
                                key={index}
                                className="rounded-lg overflow-hidden shadow-md hover:shadow-xl transition cursor-pointer border border-[#89aa7b] break-inside-avoid mb-4 inline-block w-full"
                                onClick={() => handleImageClick(`/examples/ghibli-style-image-generator/${index + 1}.webp`)}
                            >
                                <img
                                    src={`/examples/ghibli-style-image-generator/${index + 1}.webp`}
                                    alt={`Ghibli style AI image example ${index + 1}`}
                                    className="w-full h-auto object-cover"
                                />
                            </div>
                        ))}
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b] mb-10">
                        <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Best ChatGPT Ghibli Prompts</h3>
                        <p className="text-[#506a3a] mb-4">
                            Based on user experiences, here are some effective prompts for ChatGPT Studio Ghibli style images:
                        </p>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="bg-[#f8fbf3] p-3 rounded-lg border border-[#d5e6c3]">
                                <p className="text-[#506a3a] italic">"Transform this photo into a Ghibli-style scene with soft watercolors and dreamlike elements."</p>
                            </div>
                            <div className="bg-[#f8fbf3] p-3 rounded-lg border border-[#d5e6c3]">
                                <p className="text-[#506a3a] italic">"Convert my image to Ghibli style with hand-drawn animation style, watercolor techniques, and soft organic lines."</p>
                            </div>
                            <div className="bg-[#f8fbf3] p-3 rounded-lg border border-[#d5e6c3]">
                                <p className="text-[#506a3a] italic">"Create a Studio Ghibli style portrait with magical elements and a warm color palette like Howl's Moving Castle."</p>
                            </div>
                            <div className="bg-[#f8fbf3] p-3 rounded-lg border border-[#d5e6c3]">
                                <p className="text-[#506a3a] italic">"ChatGPT Ghibli prompt: transform this photo while maintaining composition but adding dreamlike Ghibli aesthetics."</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-10 text-center">
                        <h3 className="text-2xl font-bold mb-4 text-[#1c4c3b]">How to Create Ghibli Image with ChatGPT</h3>
                        <p className="text-lg text-[#506a3a] mb-6 max-w-3xl mx-auto">
                            Our free Ghibli style image generator makes it simple to transform photos with just a few clicks
                        </p>

                        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
                            <div className="bg-white p-5 rounded-xl shadow-md border border-[#89aa7b]">
                                <div className="w-12 h-12 bg-[#e7f0dc] rounded-full flex items-center justify-center mx-auto mb-4">
                                    <span className="text-xl font-bold text-[#1c4c3b]">1</span>
                                </div>
                                <h4 className="font-bold text-[#1c4c3b] mb-2">Upload Your Photo</h4>
                                <p className="text-[#506a3a] text-sm">
                                    Choose any image you want to transform into Ghibli style art
                                </p>
                            </div>

                            <div className="bg-white p-5 rounded-xl shadow-md border border-[#89aa7b]">
                                <div className="w-12 h-12 bg-[#e7f0dc] rounded-full flex items-center justify-center mx-auto mb-4">
                                    <span className="text-xl font-bold text-[#1c4c3b]">2</span>
                                </div>
                                <h4 className="font-bold text-[#1c4c3b] mb-2">Click Generate</h4>
                                <p className="text-[#506a3a] text-sm">
                                    Our ChatGPT-4o Ghibli algorithm will work its magic
                                </p>
                            </div>

                            <div className="bg-white p-5 rounded-xl shadow-md border border-[#89aa7b]">
                                <div className="w-12 h-12 bg-[#e7f0dc] rounded-full flex items-center justify-center mx-auto mb-4">
                                    <span className="text-xl font-bold text-[#1c4c3b]">3</span>
                                </div>
                                <h4 className="font-bold text-[#1c4c3b] mb-2">Download Your Ghibli Art</h4>
                                <p className="text-[#506a3a] text-sm">
                                    Get your Studio Ghibli style masterpiece instantly and free
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 添加关于Ghibli风格的介绍部分 */}
                <section id="about" className="container mx-auto px-4 py-16">
                    <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">Exploring the Magic of Ghibli Style Images</h2>
                    <p className="text-lg text-[#506a3a] mb-10 text-center max-w-3xl mx-auto">
                        Discover why Studio Ghibli's dreamlike aesthetics have captivated the world and how AI brings this style to your photos
                    </p>

                    <div className="grid md:grid-cols-2 gap-12 items-center">
                        <div>
                            <h3 className="text-2xl font-bold mb-4 text-[#1c4c3b]">Transform Photos into Ghibli Art with ChatGPT</h3>
                            <p className="text-[#506a3a] mb-4">
                                Our free Ghibli style image generator lets you convert ordinary photos into artistic masterpieces in the beloved Studio Ghibli style, characterized by soft colors, delicate lines, and dreamlike settings.
                            </p>
                            <p className="text-[#506a3a] mb-4">
                                With ChatGPT-4o technology, creating Ghibli style images has become a sensation on the internet, with millions of users transforming their photos into enchanting Ghibli portraits and landscapes.
                            </p>
                            <p className="text-[#506a3a]">
                                Even OpenAI's CEO Sam Altman joined the trend by sharing his Ghibli-style self-portrait, highlighting how Ghibli art ChatGPT transformations have captured global imagination.
                            </p>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                            <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Studio Ghibli Style Characteristics:</h3>
                            <ul className="space-y-3">
                                <li className="flex items-start">
                                    <span className="w-5 h-5 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-3 mt-1">
                                        <span className="w-2 h-2 bg-[#1c4c3b] rounded-full"></span>
                                    </span>
                                    <span className="text-[#506a3a]">Soft and warm color palettes that evoke nostalgia in Ghibli portraits</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-5 h-5 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-3 mt-1">
                                        <span className="w-2 h-2 bg-[#1c4c3b] rounded-full"></span>
                                    </span>
                                    <span className="text-[#506a3a]">Delicate and intricate line work typical of Ghibli style ChatGPT generations</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-5 h-5 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-3 mt-1">
                                        <span className="w-2 h-2 bg-[#1c4c3b] rounded-full"></span>
                                    </span>
                                    <span className="text-[#506a3a]">Dreamlike settings and ethereal lighting effects in Studio Ghibli style AI</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-5 h-5 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-3 mt-1">
                                        <span className="w-2 h-2 bg-[#1c4c3b] rounded-full"></span>
                                    </span>
                                    <span className="text-[#506a3a]">Expressive character designs in Ghibli photo generator outputs</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-5 h-5 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-3 mt-1">
                                        <span className="w-2 h-2 bg-[#1c4c3b] rounded-full"></span>
                                    </span>
                                    <span className="text-[#506a3a]">Perfect balance of realism and fantasy typical in free Ghibli style image generator results</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* 补充功能区域 */}
                <section id="features" className="bg-[#e7f0dc] py-16">
                    <div className="container mx-auto px-4">
                        <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">Key Features of Our Ghibli Style Image Generator</h2>
                        <p className="text-xl text-[#506a3a] mb-16 text-center max-w-3xl mx-auto">
                            Experience next-generation ChatGPT image generator technology - powerful, free, and optimized for Studio Ghibli style
                        </p>

                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">ChatGPT-4o Ghibli Technology</h3>
                                <p className="text-[#506a3a]">
                                    Powered by cutting-edge ChatGPT-4o algorithms that perfectly capture Studio Ghibli's artistic style, color palettes, and dreamlike aesthetics better than any other tool.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Free Ghibli Style Conversions</h3>
                                <p className="text-[#506a3a]">
                                    Our Ghibli photo generator creates stunning images with exceptional detail and artistic style control, completely free for basic usage with no watermarks.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Studio Ghibli Style Prompts</h3>
                                <p className="text-[#506a3a]">
                                    Use our optimized ChatGPT Studio Ghibli prompts to get the best results when creating Ghibli images with precise artistic control.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Instant Ghibli Transformations</h3>
                                <p className="text-[#506a3a]">
                                    Our optimized pipeline ensures you can convert images to Ghibli style in seconds without compromising on quality or detail preservation.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Secure Ghibli Art Creation</h3>
                                <p className="text-[#506a3a]">
                                    Zero data retention policy - your photos and generated Ghibli style images are never stored on our servers, ensuring complete privacy.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Grok & OpenAI Ghibli Alternative</h3>
                                <p className="text-[#506a3a]">
                                    A free alternative to Grok Ghibli and OpenAI Studio Ghibli with comparable quality. Create Ghibli image with ChatGPT-level quality without subscription fees.
                                </p>
                            </div>
                        </div>
                        {/* 添加使用场景部分 */}
                        <div className="mt-16">
                            <h3 className="text-2xl font-bold mb-8 text-center text-[#1c4c3b]">Ghibli Style Image Applications</h3>
                            <div className="grid md:grid-cols-3 gap-8">
                                <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                    <h4 className="text-xl font-bold mb-4 text-[#1c4c3b]">Ghibli Portraits for Profiles</h4>
                                    <p className="text-[#506a3a]">
                                        Stand out with unique Ghibli style portraits as profile pictures. These stylized avatars are extremely popular online, with millions of users adopting this distinctive aesthetic.
                                    </p>
                                </div>
                                <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                    <h4 className="text-xl font-bold mb-4 text-[#1c4c3b]">Creative Ghibli Art Projects</h4>
                                    <p className="text-[#506a3a]">
                                        Artists and designers use our Ghibli art ChatGPT generator for concept art, illustrations, website elements, and print materials with the beloved Studio Ghibli aesthetic.
                                    </p>
                                </div>
                                <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                    <h4 className="text-xl font-bold mb-4 text-[#1c4c3b]">Personal Ghibli Transformations</h4>
                                    <p className="text-[#506a3a]">
                                        Turn treasured photos into magical Ghibli-style memories. Family pictures, vacation photos, and special moments become enchanting when converted to Ghibli style for free.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 更新FAQ部分 */}
                <section id="faq" className="container mx-auto px-4 py-16">
                    <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">Ghibli Style Image Generator FAQ</h2>
                    <p className="text-xl text-[#506a3a] mb-16 text-center">
                        Have other questions about our free Ghibli style image generator? Contact us at zhugetd@gmail.com
                    </p>

                    <div className="max-w-3xl mx-auto space-y-6">
                        {[
                            {
                                question: 'What is this Ghibli Style Image Generator and how does it work?',
                                answer: 'Our free Ghibli Style Image Generator is an AI-powered tool that transforms your photos into Studio Ghibli-style artwork. Powered by the same ChatGPT-4o technology that\'s taken social media by storm, it allows you to create high-quality Ghibli-style transformations from any uploaded image, with no registration required.'
                            },
                            {
                                question: 'Is this Ghibli style image generator really free to use?',
                                answer: 'Yes, our basic Ghibli style image generator is completely free to use! Everyone gets 3 free transformations to start. We also offer premium options for users who need higher resolution outputs, batch processing, or additional customization features.'
                            },
                            {
                                question: 'How does your ChatGPT Ghibli prompt system work?',
                                answer: 'Our system uses optimized ChatGPT Studio Ghibli prompts behind the scenes to generate the best possible Ghibli-style transformations. The technology analyzes your image and applies the distinctive Studio Ghibli aesthetic with soft colors, dreamy lighting, and characteristic stylization.'
                            },
                            {
                                question: 'How is ChatGPT-4o Ghibli style different from other AI tools?',
                                answer: 'ChatGPT-4o\'s Ghibli-style generation is based on more advanced understanding capabilities than other tools like Grok Ghibli or basic filters. It better grasps the essence of Studio Ghibli art rather than just applying surface effects, resulting in transformed images with higher artistic quality and consistency.'
                            },
                            {
                                question: 'Can I use your generator for photos with multiple people?',
                                answer: 'Yes, our Ghibli style image generator free tool supports processing photos with multiple people, preserving each person\'s unique features while infusing them with Studio Ghibli\'s artistic style. This makes it perfect for family photos or group pictures.'
                            },
                            {
                                question: 'How do you address copyright concerns with Ghibli art generation?',
                                answer: 'Our service creates original artwork inspired by animation art styles without directly copying specific copyrighted characters or scenes. We use AI algorithms trained to transform your images into stylized artwork that evokes the aesthetic qualities of Studio Ghibli animation without infringing on their intellectual property.'
                            },
                            {
                                question: 'How does your tool compare to OpenAI Studio Ghibli features?',
                                answer: 'Our free tool provides similar quality to OpenAI Studio Ghibli functionality but without requiring a paid ChatGPT Plus subscription. We\'ve optimized the process specifically for Ghibli-style transformations, making it more accessible and user-friendly than using raw ChatGPT prompts.'
                            }
                        ].map((faq, index) => (
                            <div key={index} className="border border-[#89aa7b] rounded-lg p-6 bg-white">
                                <h3 className="text-xl font-bold mb-4 flex items-center text-[#1c4c3b]">
                                    <span className="flex items-center justify-center w-8 h-8 bg-[#1c4c3b] text-white rounded-full mr-4">
                                        {index + 1}
                                    </span>
                                    {faq.question}
                                </h3>
                                <p className="text-[#506a3a] ml-12">{faq.answer}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 添加对比分析部分 */}
                <section className="bg-[#e7f0dc] py-16">
                    <div className="container mx-auto px-4">
                        <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">Comparing Ghibli Style Image Generators</h2>
                        <p className="text-xl text-[#506a3a] mb-16 text-center max-w-3xl mx-auto">
                            See how our free Ghibli style image generator compares to other tools including Grok Ghibli and OpenAI Studio Ghibli
                        </p>

                        <div className="overflow-x-auto">
                            <table className="min-w-full bg-white text-black rounded-xl shadow-md border border-[#89aa7b]">
                                <thead>
                                    <tr className="bg-[#1c4c3b] text-white">
                                        <th className="py-3 px-4 text-left">Ghibli Generator</th>
                                        <th className="py-3 px-4 text-left">Price</th>
                                        <th className="py-3 px-4 text-left">Speed</th>
                                        <th className="py-3 px-4 text-left">Quality</th>
                                        <th className="py-3 px-4 text-left">Features</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-[#e7f0dc]">
                                        <td className="py-3 px-4 font-medium">Our Free Ghibli Tool</td>
                                        <td className="py-3 px-4">Free (3 images)</td>
                                        <td className="py-3 px-4">Extremely fast</td>
                                        <td className="py-3 px-4">Extremely high</td>
                                        <td className="py-3 px-4">ChatGPT-4o quality, user-friendly interface, no account needed</td>
                                    </tr>
                                    <tr className="border-b border-[#e7f0dc]">
                                        <td className="py-3 px-4 font-medium">ChatGPT-4o Ghibli</td>
                                        <td className="py-3 px-4">$20/month</td>
                                        <td className="py-3 px-4">Fast</td>
                                        <td className="py-3 px-4">Extremely high</td>
                                        <td className="py-3 px-4">Requires ChatGPT Plus subscription, complex prompting</td>
                                    </tr>
                                    <tr className="border-b border-[#e7f0dc]">
                                        <td className="py-3 px-4 font-medium">Grok Ghibli</td>
                                        <td className="py-3 px-4">$16/month</td>
                                        <td className="py-3 px-4">Fast</td>
                                        <td className="py-3 px-4">High</td>
                                        <td className="py-3 px-4">Requires X Premium subscription, limited style options</td>
                                    </tr>
                                    <tr className="border-b border-[#e7f0dc]">
                                        <td className="py-3 px-4 font-medium">OpenAI Studio Ghibli</td>
                                        <td className="py-3 px-4">Varies</td>
                                        <td className="py-3 px-4">Medium</td>
                                        <td className="py-3 px-4">Medium-high</td>
                                        <td className="py-3 px-4">Requires API access and coding knowledge</td>
                                    </tr>
                                    <tr>
                                        <td className="py-3 px-4 font-medium">Basic Style Filters</td>
                                        <td className="py-3 px-4">Free/Varies</td>
                                        <td className="py-3 px-4">Fast</td>
                                        <td className="py-3 px-4">Low</td>
                                        <td className="py-3 px-4">Simple filters, not true Ghibli style transformation</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* 新闻与趋势 */}
                <section className="container mx-auto px-4 py-16">
                    <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">Latest Ghibli Style Image Trends</h2>
                    <p className="text-xl text-[#506a3a] mb-10 text-center max-w-3xl mx-auto">
                        The Ghibli style image generation phenomenon has taken social media by storm
                    </p>

                    <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b] mb-10">
                        <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Viral ChatGPT Ghibli Transformations</h3>
                        <p className="text-[#506a3a] mb-4">
                            ChatGPT-4o has made Ghibli style transformations a global sensation, with millions creating Studio Ghibli versions of themselves. Social media platforms have been flooded with stunning AI-generated Ghibli portraits as users discover how to create Ghibli images with ChatGPT.
                        </p>
                        <p className="text-[#506a3a]">
                            OpenAI CEO Sam Altman noted the irony of the trend, tweeting: "Spent years trying to create advanced AI for important problems, and what got everyone excited? Ghibli style portraits." This highlights how the artistic beauty of Studio Ghibli has universal appeal.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                            <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Ghibli Art ChatGPT Revolution</h3>
                            <p className="text-[#506a3a] mb-4">
                                While tools like Grok Ghibli emerged as alternatives, ChatGPT-4o's Ghibli style capabilities set the standard. Our free generator brings this premium technology to everyone without subscription requirements.
                            </p>
                            <p className="text-[#506a3a]">
                                Independent tests show our generator produces results comparable to paid options, making Studio Ghibli style AI accessible to all creative enthusiasts.
                            </p>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                            <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Creative Ghibli Style Uses</h3>
                            <p className="text-[#506a3a] mb-4">
                                Beyond profile pictures, artists are using our Ghibli photo generator to create illustrations, concept art, and marketing materials with the distinctive Studio Ghibli aesthetic.
                            </p>
                            <p className="text-[#506a3a]">
                                Many report that converted Ghibli style images become their most engaged content on social platforms, showing the universal appeal of this beautiful artistic style.
                            </p>
                        </div>
                    </div>
                </section>

                {/* 统计区域和用户评价部分保持注释状态 */}
            </main>
        </div>
    );
};

export default HomePage; 