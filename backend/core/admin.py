"""
Custom admin configuration for AI VTuber system.
"""

from django.contrib import admin
from django.template.response import TemplateResponse
from .models import Character, CeleryMonitor


class CharacterAdmin(admin.ModelAdmin):
    """Admin for AI VTuber characters."""

    list_display = [
        'name', 'name_th', 'name_en', 'response_language', 'response_length',
        'enable_per_user_memory', 'memory_duration_days', 'is_active',
        'created_at', 'updated_at',
    ]
    list_filter = ['is_active', 'response_language', 'response_length', 'created_at']
    search_fields = ['name', 'name_th', 'name_en', 'description', 'system_prompt']
    readonly_fields = ['id', 'created_at', 'updated_at']

    fieldsets = (
        ('Basic Info', {
            'fields': ('name', 'name_th', 'name_en', 'description',
                       'avatar_url', 'avatar_border_color', 'is_active')
        }),
        ('AI Configuration', {
            'fields': ('system_prompt', 'system_prompt_ai'),
            'description': 'System prompt defines the character personality and behavior'
        }),
        ('Response Settings', {
            'fields': ('response_language', 'response_length', 'custom_max_tokens'),
            'description': ('Language and length enforced server-side. '
                            'custom_max_tokens only applies when response_length = custom.')
        }),
        ('Memory', {
            'fields': ('enable_per_user_memory', 'memory_duration_days'),
            'description': 'Per-user memory keeps separate chat history per viewer name'
        }),
        ('Metadata', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(CeleryMonitor)
class CeleryMonitorAdmin(admin.ModelAdmin):
    """Django Admin page for monitoring Celery workers, active tasks, and broker stats."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        from config.celery import app as celery_app
        inspector = celery_app.control.inspect(timeout=1.5)

        error = None
        workers = {}
        active_tasks = {}
        registered_tasks = {}
        stats = {}
        try:
            workers = inspector.ping() or {}
            active_tasks = inspector.active() or {}
            registered_tasks = inspector.registered() or {}
            stats = inspector.stats() or {}
        except Exception as e:
            error = str(e)

        # Pre-compute rows: Django templates cannot do dynamic key lookups
        # (stats[worker_name]), so join ping/stats/active per worker here.
        worker_rows = []
        for name in sorted(workers):
            wstat = stats.get(name) or {}
            pool = wstat.get('pool') or {}
            processed = wstat.get('processed') or {}
            worker_rows.append({
                'name': name,
                'concurrency': pool.get('max-concurrency', 'N/A'),
                'state': pool.get('processes', 'N/A'),
                'processed_total': sum(processed.values()),
                'active_count': len(active_tasks.get(name) or []),
                'task_count': len(registered_tasks.get(name) or []),
            })

        context = {
            **self.admin_site.each_context(request),
            'title': 'Celery Worker & Task Monitor',
            'broker_url': celery_app.conf.broker_url,
            'result_backend': celery_app.conf.result_backend,
            'error': error,
            'worker_rows': worker_rows,
            'worker_count': len(worker_rows),
            'active_tasks': active_tasks,
            'registered_tasks': registered_tasks,
        }
        return TemplateResponse(request, 'admin/celery_monitor.html', context)


# Register admin classes
admin.site.register(Character, CharacterAdmin)
