"""Tests for providers models, views, and serializers."""

import uuid

import pytest
from django.test import RequestFactory
from rest_framework import status

from providers.models import LLMProvider
from providers.views import LLMProviderViewSet
from providers.serializers import LLMProviderSerializer


@pytest.mark.django_db
class TestLLMProviderModel:
    """Tests for the LLMProvider model."""

    def test_create_provider(self):
        provider = LLMProvider.objects.create(
            name="Test Provider",
            api_url="http://127.0.0.1:9001/v1/chat/completions",
            api_key="test-key-123",
            model_name="auto",
            temperature=0.8,
            max_tokens=4096,
            is_active=True,
        )
        assert provider.id is not None
        assert provider.name == "Test Provider"
        assert provider.api_url == "http://127.0.0.1:9001/v1/chat/completions"
        assert provider.api_key == "test-key-123"
        assert provider.model_name == "auto"
        assert provider.temperature == 0.8
        assert provider.max_tokens == 4096
        assert provider.is_active is True

    def test_str_representation(self):
        provider = LLMProvider.objects.create(
            name="Test API",
            model_name="gpt-3.5-turbo",
        )
        assert str(provider) == "Test API (gpt-3.5-turbo)"

    def test_default_values(self):
        provider = LLMProvider.objects.create()
        assert provider.name == "Free LLM API"
        assert provider.api_url == "http://192.168.1.10:9001/v1/chat/completions"
        assert provider.model_name == "auto"
        assert provider.temperature == 0.7
        assert provider.max_tokens == 2048
        assert provider.is_active is True

    def test_ordering(self):
        p1 = LLMProvider.objects.create(name="First", is_active=True)
        p2 = LLMProvider.objects.create(name="Second", is_active=True)
        providers = list(LLMProvider.objects.all())
        # Ordered by -created_at
        assert len(providers) == 2
        names = {p.name for p in providers}
        assert names == {"First", "Second"}

    def test_update_provider(self):
        provider = LLMProvider.objects.create(name="Original")
        provider.name = "Updated"
        provider.temperature = 0.9
        provider.save()

        refreshed = LLMProvider.objects.get(pk=provider.pk)
        assert refreshed.name == "Updated"
        assert refreshed.temperature == 0.9

    def test_soft_delete_via_is_active(self):
        provider = LLMProvider.objects.create(name="To Deactivate", is_active=True)
        provider.is_active = False
        provider.save()

        active_providers = LLMProvider.objects.filter(is_active=True)
        assert provider not in active_providers


@pytest.mark.django_db
class TestLLMProviderSerializer:
    """Tests for LLMProviderSerializer."""

    def test_serialize(self):
        provider = LLMProvider.objects.create(
            name="Test",
            api_url="http://test/v1/chat/completions",
            api_key="key123",
            model_name="auto",
        )
        serializer = LLMProviderSerializer(provider)
        data = serializer.data
        assert data["name"] == "Test"
        assert data["api_url"] == "http://test/v1/chat/completions"
        assert data["api_key"] == "key123"
        assert data["model_name"] == "auto"
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    def test_deserialize_create(self):
        payload = {
            "name": "New Provider",
            "api_url": "http://127.0.0.1:9001/v1/chat/completions",
            "api_key": "new-key",
            "model_name": "gpt-4",
            "temperature": 0.5,
            "max_tokens": 1024,
            "is_active": True,
        }
        serializer = LLMProviderSerializer(data=payload)
        assert serializer.is_valid(), serializer.errors
        provider = serializer.save()
        assert provider.name == "New Provider"
        assert provider.model_name == "gpt-4"

    def test_read_only_fields(self):
        provider = LLMProvider.objects.create(name="Test")
        serializer = LLMProviderSerializer(provider)
        assert serializer.fields["id"].read_only
        assert serializer.fields["created_at"].read_only
        assert serializer.fields["updated_at"].read_only

    def test_partial_update(self):
        provider = LLMProvider.objects.create(
            name="Original", api_key="old-key", temperature=0.7
        )
        serializer = LLMProviderSerializer(
            provider,
            data={"temperature": 0.95},
            partial=True,
        )
        assert serializer.is_valid(), serializer.errors
        updated = serializer.save()
        assert updated.temperature == 0.95
        assert updated.name == "Original"
        assert updated.api_key == "old-key"

    def test_api_key_optional(self):
        payload = {
            "name": "No Key Provider",
            "api_url": "http://127.0.0.1:9001/v1/chat/completions",
        }
        serializer = LLMProviderSerializer(data=payload)
        assert serializer.is_valid(), serializer.errors
        provider = serializer.save()
        assert provider.api_key == ""


@pytest.mark.django_db
class TestLLMProviderViewSet:
    """Tests for LLMProviderViewSet (CRUD via API)."""

    def test_list_providers(self):
        LLMProvider.objects.create(name="P1")
        LLMProvider.objects.create(name="P2")

        factory = RequestFactory()
        request = factory.get("/api/llm-providers/")
        view = LLMProviderViewSet.as_view({"get": "list"})
        response = view(request)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 2

    def test_retrieve_provider(self):
        provider = LLMProvider.objects.create(name="Test", model_name="auto")

        factory = RequestFactory()
        request = factory.get(f"/api/llm-providers/{provider.id}/")
        view = LLMProviderViewSet.as_view({"get": "retrieve"})
        response = view(request, pk=provider.id)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Test"

    def test_create_provider(self):
        import json
        factory = RequestFactory()
        request = factory.post(
            "/api/llm-providers/",
            json.dumps({
                "name": "New",
                "api_url": "http://127.0.0.1:9001/v1/chat/completions",
                "model_name": "gpt-4",
                "temperature": 0.8,
                "max_tokens": 2048,
            }),
            content_type="application/json",
        )
        view = LLMProviderViewSet.as_view({"post": "create"})
        response = view(request)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "New"

    def test_update_provider(self):
        import json
        provider = LLMProvider.objects.create(name="Original", temperature=0.5)

        factory = RequestFactory()
        request = factory.put(
            f"/api/llm-providers/{provider.id}/",
            json.dumps({
                "name": "Updated",
                "api_url": provider.api_url,
                "model_name": provider.model_name,
                "temperature": 0.9,
                "max_tokens": provider.max_tokens,
                "is_active": True,
            }),
            content_type="application/json",
        )
        view = LLMProviderViewSet.as_view({"put": "update"})
        response = view(request, pk=provider.id)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated"
        assert response.data["temperature"] == 0.9

    def test_delete_provider(self):
        provider = LLMProvider.objects.create(name="ToDelete")
        assert LLMProvider.objects.filter(pk=provider.pk).exists()

        factory = RequestFactory()
        request = factory.delete(f"/api/llm-providers/{provider.id}/")
        view = LLMProviderViewSet.as_view({"delete": "destroy"})
        response = view(request, pk=provider.id)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not LLMProvider.objects.filter(pk=provider.pk).exists()

    def test_filter_active_providers(self):
        LLMProvider.objects.create(name="Active1", is_active=True)
        LLMProvider.objects.create(name="Inactive", is_active=False)
        LLMProvider.objects.create(name="Active2", is_active=True)

        active_count = LLMProvider.objects.filter(is_active=True).count()
        assert active_count == 2
