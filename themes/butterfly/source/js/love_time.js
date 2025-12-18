// 状态变量：false显示总天数，true显示年月日
var isYearMonthMode = false;

function updateLoveTime() {
    var loveTimeElement = document.getElementById('love-time');
    if (!loveTimeElement) return;

    var startTimeStr = loveTimeElement.getAttribute('data-start');
    var startTime = new Date(startTimeStr);
    var now = new Date();

    var diff = now - startTime;
    if (diff < 0) {
        document.querySelector('.love-timer').innerHTML = "也就是将来的某一天...";
        return;
    }

    // 计算时分秒 (两种模式通用)
    var h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    var s = Math.floor((diff % (1000 * 60)) / 1000);

    var html = '';

    if (isYearMonthMode) {
        // --- 模式二：XX年XX月XX天 ---
        var years = now.getFullYear() - startTime.getFullYear();
        var months = now.getMonth() - startTime.getMonth();
        var days = now.getDate() - startTime.getDate();

        // 处理借位（如果当前日期小于开始日期）
        if (days < 0) {
            months--;
            // 获取上个月有多少天来补位
            var prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
            days += prevMonth.getDate();
        }
        if (months < 0) {
            years--;
            months += 12;
        }

        html = '<span>' + years + '</span>年' +
            '<span>' + months + '</span>月' +
            '<span>' + days + '</span>天' +
            '<span>' + h + '</span>时' +
            '<span>' + m + '</span>分' +
            '<span>' + s + '</span>秒';
    } else {
        // --- 模式一：总天数 (默认) ---
        var totalDays = Math.floor(diff / (1000 * 60 * 60 * 24));
        html = '<span>' + totalDays + '</span>天' +
            '<span>' + h + '</span>时' +
            '<span>' + m + '</span>分' +
            '<span>' + s + '</span>秒';
    }

    // 更新页面内容
    var timerBox = document.querySelector('.love-timer');
    if (timerBox) {
        timerBox.innerHTML = html;
    }
}

// 绑定点击事件：点击时间区域切换模式
document.addEventListener('click', function (e) {
    // 检查点击的是否是 #love-time 或其内部元素
    var target = e.target.closest('#love-time');
    if (target) {
        isYearMonthMode = !isYearMonthMode; // 切换状态
        updateLoveTime(); // 立即刷新显示，不用等1秒
    }
});

// 启动定时器逻辑 (兼容 Pjax)
if (typeof loveTimerInterval === 'undefined') {
    var loveTimerInterval = null;
}

function startLoveTimer() {
    if (loveTimerInterval) clearInterval(loveTimerInterval);
    // 只有当页面上有这个元素时才启动
    if (document.getElementById('love-time')) {
        updateLoveTime();
        loveTimerInterval = setInterval(updateLoveTime, 1000);
    }
}

// 初始化
startLoveTimer();
document.addEventListener('pjax:complete', startLoveTimer);